/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSendBoxDraftHook } from '@/renderer/hooks/chat/useSendBoxDraft';

const { layoutState, animateMock, cancelMotionMock } = vi.hoisted(() => ({
  layoutState: { isMobile: false, conversationId: 'sendbox-active-focus-conversation' },
  animateMock: vi.fn(),
  cancelMotionMock: vi.fn(),
}));
vi.mock('@/renderer/hooks/ui/useMotion', () => ({
  useMotion: () => ({ animate: animateMock, cancel: cancelMotionMock }),
}));
beforeEach(() => {
  animateMock.mockClear();
  layoutState.conversationId = 'sendbox-active-focus-conversation';
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'var(--color-primary-6)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: layoutState.conversationId,
    type: 'acp',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: layoutState.isMobile }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));

vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    isOpen: false,
    showMenu: false,
    step: 'menu',
    filename: '',
    pathPreview: '',
    menuItems: [],
    activeIndex: 0,
    loading: false,
    openExportFlow: vi.fn(),
    closeExportFlow: vi.fn(),
    handleKeyDown: vi.fn(),
    onSelectMenuItem: vi.fn(),
    setActiveIndex: vi.fn(),
    setFilename: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    answer: '',
    question: '',
    isLoading: false,
    isOpen: false,
    ask: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hooks/system/useLiveTranscriptInsertion')>();
  return {
    ...actual,
    useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
  };
});

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
  useAddEventListener: vi.fn(),
}));

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));

import SendBox from '@/renderer/components/chat/SendBox';

const SendBoxHarness = ({
  active,
  onFocused,
  disabled,
  initialValue = '',
  onSend = vi.fn().mockResolvedValue(undefined),
  onAddToDraft,
}: {
  active?: boolean;
  onFocused?: () => void;
  disabled?: boolean;
  initialValue?: string;
  onSend?: (message: string) => Promise<void | false>;
  onAddToDraft?: () => void;
}) => {
  const [value, setValue] = useState(initialValue);
  return (
    <SendBox
      value={value}
      onChange={setValue}
      onSend={onSend}
      active={active}
      onFocused={onFocused}
      disabled={disabled}
      onAddToDraft={onAddToDraft}
    />
  );
};

const usePersistedDraft = getSendBoxDraftHook('acp', { _type: 'acp', content: '', atPath: [], uploadFile: [] });
const PersistedDraftHarness = ({ onSend }: { onSend: (message: string) => Promise<void | false> }) => {
  const { data, mutate } = usePersistedDraft(layoutState.conversationId);
  return (
    <SendBox
      value={data?.content ?? ''}
      onChange={(content) => mutate((previous) => ({ ...previous, content }))}
      onSend={onSend}
    />
  );
};

describe('SendBox active-controlled focus', () => {
  it('restores a failed submission to its original persisted draft after switching conversations', async () => {
    let reject!: (error: Error) => void;
    const onSend = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectRequest) => {
          reject = rejectRequest;
        })
    );
    const cache = new Map();
    layoutState.conversationId = 'rejected-draft-conversation-a';
    const view = () => (
      <SWRConfig value={{ provider: () => cache }}>
        <PersistedDraftHarness onSend={onSend} />
      </SWRConfig>
    );
    const { rerender } = render(view());
    const input = screen.getByTestId('sendbox-input');
    fireEvent.change(input, { target: { value: 'message for A' } });
    await waitFor(() => expect(input).toHaveValue('message for A'));
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    fireEvent.change(input, { target: { value: 'new draft for A' } });
    await waitFor(() => expect(input).toHaveValue('new draft for A'));

    layoutState.conversationId = 'rejected-draft-conversation-b';
    rerender(view());
    fireEvent.change(input, { target: { value: 'draft for B' } });
    await waitFor(() => expect(input).toHaveValue('draft for B'));
    expect(screen.getByTestId('sendbox-send-btn')).not.toBeDisabled();
    await act(async () => reject(new Error('request from A failed')));
    expect(input).toHaveValue('draft for B');

    layoutState.conversationId = 'rejected-draft-conversation-a';
    rerender(view());
    await waitFor(() => expect(input).toHaveValue('new draft for A\nmessage for A'));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('unlocks a reused composer on conversation change and ignores an old failed request', async () => {
    let reject!: (error: Error) => void;
    const onSend = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectRequest) => {
          reject = rejectRequest;
        })
    );
    const { rerender } = render(<SendBoxHarness initialValue='old conversation draft' onSend={onSend} />);
    fireEvent.keyDown(screen.getByTestId('sendbox-input'), { key: 'Enter', code: 'Enter' });
    layoutState.conversationId = 'new-conversation';
    rerender(<SendBoxHarness onSend={onSend} />);
    const input = screen.getByTestId('sendbox-input');
    fireEvent.change(input, { target: { value: 'new conversation draft' } });
    expect(screen.getByTestId('sendbox-send-btn')).not.toBeDisabled();
    await act(async () => reject(new Error('old request failed')));
    expect(input).toHaveValue('new conversation draft');
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('shows sender feedback only after the parent accepts the message', async () => {
    let accept!: (result: void) => void;
    const onSend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        })
    );
    render(<SendBoxHarness initialValue='send this' onSend={onSend} />);
    fireEvent.keyDown(screen.getByTestId('sendbox-input'), { key: 'Enter', code: 'Enter' });
    expect(animateMock).not.toHaveBeenCalled();
    await act(async () => accept());
    expect(animateMock).toHaveBeenCalled();
  });

  it('restores a rejected request without playing a successful-send motion', async () => {
    render(<SendBoxHarness initialValue='keep this' onSend={vi.fn().mockRejectedValue(new Error('offline'))} />);
    const input = screen.getByTestId('sendbox-input');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(input).toHaveValue('keep this'));
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('preserves new typing when a previous send is rejected', async () => {
    let reject!: (error: Error) => void;
    const onSend = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectRequest) => {
          reject = rejectRequest;
        })
    );
    render(<SendBoxHarness initialValue='first message' onSend={onSend} />);
    const input = screen.getByTestId('sendbox-input');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    fireEvent.change(input, { target: { value: 'new draft' } });
    await act(async () => reject(new Error('offline')));
    expect(input).toHaveValue('new draft\nfirst message');
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('keeps Enter mapped to Send while Draft box has its own icon action', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onAddToDraft = vi.fn();

    render(<SendBoxHarness initialValue='queued draft' onSend={onSend} onAddToDraft={onAddToDraft} />);
    fireEvent.click(screen.getByTestId('sendbox-add-to-draft-btn'));

    expect(onAddToDraft).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    const textarea = screen.getByTestId('sendbox-input');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('queued draft');
  });

  it('restores the input when the parent blocks sending', async () => {
    const onSend = vi.fn().mockResolvedValue(false);

    render(<SendBoxHarness initialValue='blocked message' onSend={onSend} />);

    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('blocked message');
    await waitFor(() => expect(textarea.value).toBe('blocked message'));
  });

  it('uses the platform primary Enter shortcut for Draft box without sending', () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onAddToDraft = vi.fn();

    render(<SendBoxHarness initialValue='save this for later' onSend={onSend} onAddToDraft={onAddToDraft} />);

    const textarea = screen.getByTestId('sendbox-input');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(onAddToDraft).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('focuses the textarea on mount when active is true (desktop)', async () => {
    layoutState.isMobile = false;
    render(<SendBoxHarness active={true} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('focuses on mount when active is omitted (default true, preserves single-conversation behavior)', async () => {
    layoutState.isMobile = false;
    render(<SendBoxHarness />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('does NOT focus on mount when active is false', async () => {
    layoutState.isMobile = false;
    render(
      <div>
        <button type='button'>outside</button>
        <SendBoxHarness active={false} />
      </div>
    );
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    screen.getByRole('button', { name: 'outside' }).focus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus());
    expect(textarea).not.toHaveFocus();
  });

  it('does not force focus on mobile even when active', async () => {
    layoutState.isMobile = true;
    render(
      <div>
        <button type='button'>outside</button>
        <SendBoxHarness active={true} />
      </div>
    );
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    screen.getByRole('button', { name: 'outside' }).focus();
    expect(textarea).not.toHaveFocus();
  });

  it('calls onFocused when the textarea gains focus', () => {
    layoutState.isMobile = false;
    const onFocused = vi.fn();
    render(<SendBoxHarness active={false} onFocused={onFocused} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
    });
    expect(onFocused).toHaveBeenCalledTimes(1);
  });
});

describe('SendBox selection→focus downward effect', () => {
  it('focuses when active transitions false→true', async () => {
    layoutState.isMobile = false;
    const { rerender } = render(<SendBoxHarness active={false} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    expect(textarea).not.toHaveFocus();
    rerender(<SendBoxHarness active={true} />);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('focuses once textarea becomes enabled while active (warmup recovery)', async () => {
    layoutState.isMobile = false;
    const { rerender } = render(<SendBoxHarness active={true} disabled={true} />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    expect(textarea).not.toHaveFocus();
    rerender(<SendBoxHarness active={true} disabled={false} />);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('does not move the caret if the box is already focused when it becomes active', async () => {
    layoutState.isMobile = false;
    const { rerender } = render(<SendBoxHarness active={false} initialValue='hello world' />);
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(2, 2);
    });
    rerender(<SendBoxHarness active={true} initialValue='hello world' />);
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea.selectionStart).toBe(2);
  });

  it('never focuses while active stays false', async () => {
    layoutState.isMobile = false;
    render(
      <div>
        <button type='button'>outside</button>
        <SendBoxHarness active={false} />
      </div>
    );
    const textarea = screen.getByTestId('sendbox-input') as HTMLTextAreaElement;
    screen.getByRole('button', { name: 'outside' }).focus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus());
    expect(textarea).not.toHaveFocus();
  });
});
