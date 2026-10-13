import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileService } from '@/renderer/services/FileService';
import { useAbortUploadsOnConversationChange } from '@/renderer/hooks/file/useAbortUploadsOnConversationChange';
import { abortUpload, abortUploads, useActiveUploads } from '@/renderer/hooks/file/useUploadState';

class FakeUploadRequest extends EventTarget {
  static requests: FakeUploadRequest[] = [];
  static completeNewRequests = false;

  upload = new EventTarget();
  status = 0;
  statusText = '';
  responseText = '';
  body?: FormData;
  settled = false;

  open() {}

  send(body: FormData) {
    this.body = body;
    FakeUploadRequest.requests.push(this);
    if (FakeUploadRequest.completeNewRequests) queueMicrotask(() => this.succeed());
  }

  succeed() {
    if (this.settled) return;
    const file = this.body?.get('file');
    if (!(file instanceof File)) throw new Error('Expected an uploaded file');
    this.settled = true;
    this.status = 200;
    this.responseText = JSON.stringify({ success: true, data: `/uploads/${file.name}` });
    this.dispatchEvent(new Event('load'));
  }

  abort() {
    if (this.settled) return;
    this.settled = true;
    this.dispatchEvent(new Event('abort'));
  }

  fail(tooLarge = false) {
    this.settled = true;
    this.status = tooLarge ? 413 : 0;
    this.dispatchEvent(new Event(tooLarge ? 'load' : 'error'));
  }
}

const files = (...names: string[]): FileList => {
  const values = names.map((name) => new File(['content'], name, { type: 'text/plain', lastModified: 1 }));
  return Object.assign(values, { item: (index: number) => values[index] ?? null }) as unknown as FileList;
};

describe('file upload cancellation', () => {
  beforeEach(() => {
    FakeUploadRequest.requests = [];
    FakeUploadRequest.completeNewRequests = false;
    vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
  });

  afterEach(async () => {
    cleanup();
    FakeUploadRequest.completeNewRequests = true;
    abortUploads();
    await Promise.resolve();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['conversation change', 'unmount', 'bulk cancel'] as const)(
    'drops the entire batch after %s without uploading its remaining files',
    async (reason) => {
      const hook = renderHook(({ id }) => useAbortUploadsOnConversationChange(id, 'sendbox'), {
        initialProps: { id: 'old' },
      });
      const pending = FileService.processDroppedFiles(files('first.txt', 'second.txt', 'third.txt'), 'old');
      FakeUploadRequest.requests[0].succeed();
      await waitFor(() => expect(FakeUploadRequest.requests).toHaveLength(2));

      FakeUploadRequest.completeNewRequests = true;
      if (reason === 'conversation change') hook.rerender({ id: 'new' });
      else if (reason === 'unmount') hook.unmount();
      else abortUploads();

      const result = await pending;
      expect(FakeUploadRequest.requests).toHaveLength(2);
      expect(result).toEqual([]);
    }
  );

  it('drops a completed response when its conversation closes before delivery', async () => {
    const pending = FileService.processDroppedFiles(files('first.txt'), 'old');
    FakeUploadRequest.requests[0].succeed();
    abortUploads({ conversationId: 'old' });

    await expect(pending).resolves.toEqual([]);
  });

  it('keeps completed and remaining files when the user cancels just one upload', async () => {
    const hook = renderHook(() => useActiveUploads('sendbox'));
    let pending!: ReturnType<typeof FileService.processDroppedFiles>;
    act(() => {
      pending = FileService.processDroppedFiles(files('first.txt', 'second.txt', 'third.txt'), 'old');
      FakeUploadRequest.requests[0].succeed();
    });
    await waitFor(() => expect(hook.result.current[0]?.name).toBe('second.txt'));

    FakeUploadRequest.completeNewRequests = true;
    await act(async () => {
      abortUpload(hook.result.current[0].id);
      await pending;
    });

    expect((await pending).map((file) => file.name)).toEqual(['first.txt', 'third.txt']);
    expect(hook.result.current).toEqual([]);
  });

  it('only cancels batches matching the requested source and conversation', async () => {
    const dropped = FileService.processDroppedFiles(files('old.txt', 'unsent.txt'), 'old');
    const kept = FileService.processDroppedFiles(files('new.txt'), 'new');
    const workspace = FileService.processDroppedFiles(files('workspace.txt'), 'old', 'workspace');

    FakeUploadRequest.completeNewRequests = true;
    abortUploads({ source: 'sendbox', exceptConversationId: 'new' });
    FakeUploadRequest.requests[1].succeed();
    FakeUploadRequest.requests[2].succeed();

    expect((await Promise.all([dropped, kept, workspace])).map((result) => result.map((file) => file.name))).toEqual([
      [],
      ['new.txt'],
      ['workspace.txt'],
    ]);
    expect(FakeUploadRequest.requests).toHaveLength(3);
  });

  it('continues the batch after a single network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = FileService.processDroppedFiles(files('failed.txt', 'success.txt'), 'old');
    FakeUploadRequest.completeNewRequests = true;
    FakeUploadRequest.requests[0].fail();

    expect((await pending).map((file) => file.name)).toEqual(['success.txt']);
  });

  it('still rejects oversize files and stops later uploads', async () => {
    const pending = FileService.processDroppedFiles(files('oversize.txt', 'unsent.txt'), 'old');
    const assertion = expect(pending).rejects.toThrow('FILE_TOO_LARGE');
    FakeUploadRequest.requests[0].fail(true);

    await assertion;
    expect(FakeUploadRequest.requests).toHaveLength(1);
  });

  it('returns managed metadata for all successful files', async () => {
    FakeUploadRequest.completeNewRequests = true;

    await expect(FileService.processDroppedFiles(files('a.txt', 'b.txt'), 'current')).resolves.toEqual([
      { name: 'a.txt', path: '/uploads/a.txt', size: 7, type: 'text/plain', lastModified: 1 },
      { name: 'b.txt', path: '/uploads/b.txt', size: 7, type: 'text/plain', lastModified: 1 },
    ]);
  });
});
