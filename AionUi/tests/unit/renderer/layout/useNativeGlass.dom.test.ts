import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativeGlass } from '@/renderer/components/layout/Titlebar/useNativeGlass';

const mocks = vi.hoisted(() => ({
  desktop: vi.fn(() => true),
  update: vi.fn().mockResolvedValue(true),
  passthrough: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: mocks.desktop, isMacOS: () => true }));
vi.mock('@/common', () => ({
  ipcBridge: {
    windowControls: { updateGlass: { invoke: mocks.update }, setPointerPassthrough: { invoke: mocks.passthrough } },
  },
}));

describe('native glass window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.desktop.mockReturnValue(true);
    mocks.update.mockResolvedValue(true);
    document.body.innerHTML = '<div class="app-shell"><div class="glass-window-panel"></div></div>';
    const panel = document.querySelector('.glass-window-panel') as HTMLElement;
    Object.defineProperty(panel, 'offsetWidth', { value: 720 });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 30, width: 720, height: 600 } as DOMRect);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.removeAttribute('arco-theme');
  });

  it('follows the actual panel bounds and synchronizes a theme change', async () => {
    const hook = renderHook(useNativeGlass);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        regions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }],
        dark: false,
      })
    );
    act(() => document.body.setAttribute('arco-theme', 'dark'));
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ dark: true })));
    hook.unmount();
    expect(mocks.update).toHaveBeenLastCalledWith({ regions: [], dark: false });
  });

  it('leaves a readable fallback when the native material is unavailable', async () => {
    mocks.update.mockResolvedValue(false);
    const hook = renderHook(useNativeGlass);
    await waitFor(() => expect(document.documentElement.dataset.nativeGlass).toBe('false'));
    expect(document.documentElement.dataset.glassDesktop).toBe('true');
    hook.unmount();
  });

  it('passes clicks through only the empty desktop space and restores panel input', async () => {
    const hook = renderHook(useNativeGlass);
    fireEvent.mouseMove(document.querySelector('.app-shell')!, { clientX: 40, clientY: 100 });
    expect(mocks.passthrough).toHaveBeenLastCalledWith(true);
    fireEvent.mouseMove(document.querySelector('.glass-window-panel')!, { clientX: 120, clientY: 100 });
    expect(mocks.passthrough).toHaveBeenLastCalledWith(false);
    hook.unmount();
  });

  it('keeps browser pages independent of native window APIs', () => {
    mocks.desktop.mockReturnValue(false);
    const hook = renderHook(useNativeGlass);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.glassDesktop).toBeUndefined();
    hook.unmount();
  });
});
