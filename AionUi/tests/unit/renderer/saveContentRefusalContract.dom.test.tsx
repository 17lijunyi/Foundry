/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// `saveContent`'s contract when a write is refused: it reports the failure to its
// caller and leaves the tab dirty.
//
// This is the CONTRACT layer — no DOM assertions live here. Whether the user
// actually sees a message is covered separately by previewPanelNotices.dom.test.tsx,
// which renders the panel. (The file was previously named "...SaveFailureVisible",
// which promised the visible half and delivered the contract half.)
//
// The bug being pinned: Ctrl+S ran `void saveContent()`, throwing the promise away.
// A 409 (the file changed on disk since this tab read it) means the write was
// refused — but the rejection went nowhere, so nothing was shown and the tab kept
// its post-save appearance. The user believed the edit was on disk.
//
// The load-bearing assertion here is that the tab is STILL DIRTY after a rejected
// save. That is the part most easily written as "we showed a message" while the
// state quietly went clean anyway.

import React from 'react';
import { act, render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ writeContent: vi.fn(), getContentMetadata: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeContent: { invoke: h.writeContent },
      getContentMetadata: { invoke: h.getContentMetadata },
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      readFile: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
      readContent: { invoke: async () => null },
    },
  },
}));

import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import RevisionReview from '@/renderer/pages/conversation/Preview/components/RevisionReview';

let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

const mount = (): void => {
  render(
    <PreviewProvider>
      <Probe />
    </PreviewProvider>
  );
};

const fileRef = { kind: 'project' as const, pe_id: 'peA', relative_path: 'notes/a.md' };

/** A backend HTTP error shaped the way `isBackendHttpError` recognises. */
const backendError = (status: number, code: string): Error => {
  const err = new Error(`Backend PUT failed (${status})`);
  Object.assign(err, { name: 'BackendHttpError', status, code, details: undefined });
  return err;
};

const openAndEdit = (): void => {
  act(() => {
    ctx.openPreview('original', 'markdown', { title: 'a.md', file_name: 'a.md', fileRef, lastModified: 1 });
  });
  act(() => ctx.updateContent('edited by user'));
};

const activeTab = () => ctx.tabs.find((t) => t.id === ctx.activeTabId);

beforeEach(() => {
  localStorage.clear();
  h.writeContent.mockReset().mockResolvedValue(true);
  h.getContentMetadata.mockReset().mockResolvedValue({
    name: 'a.md',
    path: '/abs/a.md',
    size: 8,
    type: 'file',
    lastModified: 2,
  });
});

afterEach(() => {
  cleanup();
});

describe('a rejected save leaves the tab dirty', () => {
  it('keeps the tab dirty and the edit intact when the backend returns 409', async () => {
    h.writeContent.mockRejectedValue(backendError(409, 'CONFLICT'));
    mount();
    openAndEdit();
    expect(activeTab()?.isDirty).toBe(true);

    // saveContent rethrows; the caller is responsible for surfacing it.
    await act(async () => {
      await expect(ctx.saveContent()).rejects.toThrow();
    });

    // The whole point: not silently "saved".
    expect(activeTab()?.isDirty).toBe(true);
    expect(activeTab()?.content).toBe('edited by user');
  });

  it('surfaces the rejection to the caller rather than swallowing it', async () => {
    h.writeContent.mockRejectedValue(backendError(409, 'CONFLICT'));
    mount();
    openAndEdit();

    let caught: unknown = null;
    await act(async () => {
      try {
        await ctx.saveContent();
      } catch (e) {
        caught = e;
      }
    });

    // A caller that awaits can see the failure; `void saveContent()` could not.
    expect(caught).not.toBeNull();
    expect((caught as { status?: number }).status).toBe(409);
  });

  it('keeps the tab dirty for a non-conflict failure too', async () => {
    h.writeContent.mockRejectedValue(backendError(500, 'INTERNAL_ERROR'));
    mount();
    openAndEdit();

    await act(async () => {
      await expect(ctx.saveContent()).rejects.toThrow();
    });

    expect(activeTab()?.isDirty).toBe(true);
  });

  // A write the backend accepted-but-reported-false must not read as success either.
  it('reports false without clearing dirty when the write returns false', async () => {
    h.writeContent.mockResolvedValue(false);
    mount();
    openAndEdit();

    let result: boolean | undefined;
    await act(async () => {
      result = await ctx.saveContent();
    });

    expect(result).toBe(false);
    expect(activeTab()?.isDirty).toBe(true);
  });

  it('clears dirty only on a genuinely successful save', async () => {
    h.writeContent.mockResolvedValue(true);
    mount();
    openAndEdit();

    await act(async () => {
      await ctx.saveContent();
    });

    expect(activeTab()?.isDirty).toBe(false);
    expect(activeTab()?.originalContent).toBe('edited by user');
  });

  it('preserves newer typing as unsaved when the earlier revision finishes saving', async () => {
    let finishWrite: (value: boolean) => void = () => {};
    h.writeContent.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishWrite = resolve)));
    mount();
    openAndEdit();
    const saving = ctx.saveContent();
    act(() => ctx.updateContent('newer typing while saving'));

    await act(async () => {
      finishWrite(true);
      await saving;
    });

    expect(activeTab()?.content).toBe('newer typing while saving');
    expect(activeTab()?.originalContent).toBe('edited by user');
    expect(activeTab()?.isDirty).toBe(true);
  });

  it('restores the original as an unsaved draft without issuing another disk write', async () => {
    mount();
    openAndEdit();
    await act(async () => {
      await ctx.saveContent();
    });
    act(() => ctx.updateContent('original'));

    expect(activeTab()?.content).toBe('original');
    expect(activeTab()?.isDirty).toBe(true);
    expect(h.writeContent).toHaveBeenCalledTimes(1);
  });
});

describe('reviewing and adopting an editor revision', () => {
  const props = () => ({
    original: 'Original user document',
    draft: 'Revised user document',
    dirty: true,
    onAdopt: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    onRestoreDraft: vi.fn<(content: string) => void>(),
  });

  const openComparison = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'preview.revisionReview.review' }));
  };

  it('shows both real versions without saving until adoption is explicitly requested', () => {
    const options = props();
    render(<RevisionReview {...options} />);
    openComparison();

    expect(screen.getByText(options.original)).toBeTruthy();
    expect(screen.getByText(options.draft)).toBeTruthy();
    expect(options.onAdopt).not.toHaveBeenCalled();
  });

  it('keeps the comparison and draft available when adoption is refused', async () => {
    const options = props();
    options.onAdopt.mockResolvedValue(false);
    render(<RevisionReview {...options} />);
    openComparison();
    fireEvent.click(screen.getByRole('button', { name: 'preview.revisionReview.adopt' }));
    await waitFor(() => expect(options.onAdopt).toHaveBeenCalledTimes(1));

    expect(screen.getByText(options.draft)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'preview.revisionReview.undo' })).toBeNull();
  });

  it('restores only an unsaved original draft after a successful adoption', async () => {
    const options = props();
    const view = render(<RevisionReview {...options} />);
    openComparison();
    fireEvent.click(screen.getByRole('button', { name: 'preview.revisionReview.adopt' }));
    await waitFor(() => expect(options.onAdopt).toHaveBeenCalledTimes(1));
    view.rerender(<RevisionReview {...options} original={options.draft} dirty={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'preview.revisionReview.undo' }));

    expect(options.onRestoreDraft).toHaveBeenCalledWith(options.original);
    expect(options.onAdopt).toHaveBeenCalledTimes(1);
  });

  it('does not offer restoration over newer user edits', async () => {
    const options = props();
    const view = render(<RevisionReview {...options} />);
    openComparison();
    fireEvent.click(screen.getByRole('button', { name: 'preview.revisionReview.adopt' }));
    await waitFor(() => expect(options.onAdopt).toHaveBeenCalledTimes(1));
    view.rerender(<RevisionReview {...options} original={options.draft} draft='Further user edits' dirty />);

    expect(screen.queryByRole('button', { name: 'preview.revisionReview.undo' })).toBeNull();
    expect(options.onRestoreDraft).not.toHaveBeenCalled();
  });

  it('does not offer restoration after a different revision is reloaded from disk', async () => {
    const options = props();
    const view = render(<RevisionReview {...options} />);
    openComparison();
    fireEvent.click(screen.getByRole('button', { name: 'preview.revisionReview.adopt' }));
    await waitFor(() => expect(options.onAdopt).toHaveBeenCalledTimes(1));
    view.rerender(<RevisionReview {...options} original='External change' draft='External change' dirty={false} />);

    expect(screen.queryByRole('button', { name: 'preview.revisionReview.undo' })).toBeNull();
    expect(options.onRestoreDraft).not.toHaveBeenCalled();
  });

  it('ignores repeated adoption while the write is pending', async () => {
    const options = props();
    let finishWrite: (value: boolean) => void = () => {};
    options.onAdopt.mockImplementation(() => new Promise<boolean>((resolve) => (finishWrite = resolve)));
    render(<RevisionReview {...options} />);
    openComparison();
    const adopt = screen.getByRole('button', { name: 'preview.revisionReview.adopt' });
    fireEvent.click(adopt);
    fireEvent.click(adopt);
    await act(async () => finishWrite(false));

    expect(options.onAdopt).toHaveBeenCalledTimes(1);
    expect(screen.getByText(options.draft)).toBeTruthy();
  });
});
