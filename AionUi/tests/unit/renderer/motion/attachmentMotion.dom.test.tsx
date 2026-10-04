import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FilePreview from '@/renderer/components/media/FilePreview';

const { animate, metadata } = vi.hoisted(() => ({ animate: vi.fn(), metadata: vi.fn() }));
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate }) }));
vi.mock('@/common', () => ({ ipcBridge: { fs: { getFileMetadata: { invoke: metadata } } } }));
vi.mock('@/renderer/services/FileService', () => ({ getFileExtension: () => '.md' }));
vi.mock('@/renderer/services/i18n/format', () => ({ formatByteSize: () => '1 KB' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en-US' } }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('attachment arrival feedback', () => {
  it('moves a ready draft attachment only once, after metadata succeeds', async () => {
    let resolve!: (value: { size: number }) => void;
    metadata.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(<FilePreview path='/draft.md' onRemove={() => {}} />);
    expect(animate).not.toHaveBeenCalled();
    await act(async () => resolve({ size: 1000 }));
    view.rerender(<FilePreview path='/draft.md' onRemove={() => {}} />);
    expect(animate).toHaveBeenCalledOnce();
  });
  it('does not animate read-only historical attachments', async () => {
    metadata.mockResolvedValue({ size: 1000 });
    render(<FilePreview path='/sent.md' onRemove={() => {}} readonly />);
    await waitFor(() => expect(metadata).toHaveBeenCalled());
    expect(animate).not.toHaveBeenCalled();
  });
  it('does not signal success when metadata cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    metadata.mockRejectedValue(new Error('missing file'));
    render(<FilePreview path='/missing.md' onRemove={() => {}} />);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(animate).not.toHaveBeenCalled();
    error.mockRestore();
  });
  it('ignores readiness arriving after the chip was removed', async () => {
    let resolve!: (value: { size: number }) => void;
    metadata.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(<FilePreview path='/removed.md' onRemove={() => {}} />);
    view.unmount();
    await act(async () => resolve({ size: 1000 }));
    expect(animate).not.toHaveBeenCalled();
  });
});
