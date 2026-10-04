import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';
const animateMock = vi.hoisted(() => vi.fn());
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate: animateMock }) }));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessage: {
        invoke: vi.fn(),
      },
    },
  },
}));

describe('MessageToolGroupSummary', () => {
  beforeEach(() => animateMock.mockClear());

  const toolMessage = (status: string): ToolMessage =>
    ({
      id: 'tool-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: { update: { tool_call_id: 'tool-1', status, title: 'Read requirements', kind: 'read' } },
    }) as ToolMessage;

  it('folds successful steps once and preserves a manually reopened group', () => {
    const { rerender } = render(<MessageToolGroupSummary messages={[toolMessage('in_progress')]} />);
    rerender(<MessageToolGroupSummary messages={[toolMessage('completed')]} />);
    expect(screen.getByRole('button', { name: /View Steps/ })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: /View Steps/ }));
    rerender(<MessageToolGroupSummary messages={[toolMessage('completed')]} />);
    expect(screen.getByRole('button', { name: /View Steps/ })).toHaveAttribute('aria-expanded', 'true');
    expect(animateMock).toHaveBeenCalledTimes(1);
  });

  it('keeps failed steps open instead of hiding their outcome', () => {
    const { rerender } = render(<MessageToolGroupSummary messages={[toolMessage('in_progress')]} />);
    rerender(<MessageToolGroupSummary messages={[toolMessage('failed')]} />);
    expect(screen.getByRole('button', { name: /View Steps/ })).toHaveAttribute('aria-expanded', 'true');
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('does not replay the completion of historical tool groups', () => {
    render(<MessageToolGroupSummary messages={[toolMessage('completed')]} />);
    expect(animateMock).not.toHaveBeenCalled();
  });
  it('loads full tool content when expanding a compact history item', async () => {
    const invoke = vi.mocked(ipcBridge.database.getConversationMessage.invoke);
    invoke.mockResolvedValue({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'full output' } }],
        },
      },
    } as unknown as TMessage);

    render(
      <MessageToolGroupSummary
        messages={[
          {
            id: 'message-1',
            conversation_id: 'conversation-1',
            type: 'acp_tool_call',
            content: {
              _compact: {
                truncated: true,
                original_size: 90000,
                preview_chars: 4096,
              },
              update: {
                session_update: 'tool_call',
                tool_call_id: 'tool-1',
                status: 'completed',
                title: 'rg',
                kind: 'search',
                raw_input: { pattern: 'needle', path: '.' },
                content: [{ type: 'content', content: { type: 'text', text: 'preview' } }],
              },
            },
          } as unknown as ToolMessage,
        ]}
      />
    );

    fireEvent.click(screen.getByText('View Steps · 1'));
    fireEvent.click(screen.getByText('rg'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith({
        conversation_id: 'conversation-1',
        message_id: 'message-1',
      });
    });
    expect(await screen.findByText('full output')).toBeInTheDocument();
  });
});
