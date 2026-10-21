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
    delete document.documentElement.dataset.surface;
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
        unobserve() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.removeAttribute('arco-theme');
    delete document.documentElement.dataset.surface;
  });

  it('follows the actual panel bounds and synchronizes a theme change', async () => {
    const hook = renderHook(useNativeGlass);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        regions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }],
        inputRegions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }],
        interactionActive: false,
        surface: 'glass',
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

  it('switches native material without losing the panel input geometry', async () => {
    mocks.update.mockImplementation(async (payload: { surface?: string }) => payload.surface !== 'solid');
    const hook = renderHook(useNativeGlass);
    await waitFor(() => expect(document.documentElement.dataset.nativeGlass).toBe('true'));
    act(() => {
      document.documentElement.dataset.surface = 'solid';
    });
    await waitFor(() => expect(document.documentElement.dataset.nativeGlass).toBe('false'));
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: 'solid',
        regions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }],
        inputRegions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }],
      })
    );
    hook.unmount();
  });

  it('restores the glass material when switching from a solid surface', async () => {
    document.documentElement.dataset.surface = 'solid';
    mocks.update.mockImplementation(async (payload: { surface?: string }) => payload.surface !== 'solid');
    const hook = renderHook(useNativeGlass);
    await waitFor(() => expect(document.documentElement.dataset.nativeGlass).toBe('false'));
    act(() => {
      document.documentElement.dataset.surface = 'glass';
    });
    await waitFor(() => expect(document.documentElement.dataset.nativeGlass).toBe('true'));
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ surface: 'glass' }));
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

  it.each(['glass', 'solid'])('keeps a popup over transparent space clickable on a %s surface', async (surface) => {
    document.documentElement.dataset.surface = surface;
    const hook = renderHook(useNativeGlass);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    const popup = document.createElement('div');
    popup.className = 'arco-trigger-popup';
    vi.spyOn(popup, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 200, width: 160, height: 100 } as DOMRect);
    act(() => document.body.append(popup));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inputRegions: [
            { x: 100, y: 30, width: 720, height: 600, radius: 0 },
            { x: 20, y: 200, width: 160, height: 100, radius: 0 },
          ],
        })
      )
    );
    act(() => popup.remove());
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ inputRegions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }] })
      )
    );
    hook.unmount();
  });

  it('protects the backdrop of an open modal and releases it when hidden', async () => {
    const mask = document.createElement('div');
    mask.className = 'arco-modal-mask';
    vi.spyOn(mask, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 1000, height: 800 } as DOMRect);
    document.body.append(mask);
    const hook = renderHook(useNativeGlass);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inputRegions: expect.arrayContaining([{ x: 0, y: 0, width: 1000, height: 800, radius: 0 }]),
        })
      )
    );
    act(() => {
      mask.style.display = 'none';
    });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ inputRegions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }] })
      )
    );
    hook.unmount();
  });

  it('protects explicitly marked custom overlays and releases non-interactive ones', async () => {
    const overlay = document.createElement('div');
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 650, width: 48, height: 48 } as DOMRect);
    document.body.append(overlay);
    const hook = renderHook(useNativeGlass);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    act(() => overlay.setAttribute('data-glass-input', ''));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          inputRegions: expect.arrayContaining([{ x: 20, y: 650, width: 48, height: 48, radius: 0 }]),
        })
      )
    );
    act(() => {
      overlay.style.pointerEvents = 'none';
    });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ inputRegions: [{ x: 100, y: 30, width: 720, height: 600, radius: 0 }] })
      )
    );
    hook.unmount();
  });

  it('holds input during a drag into transparent space and releases it on blur', async () => {
    const hook = renderHook(useNativeGlass);
    fireEvent.pointerDown(document.querySelector('.glass-window-panel')!);
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ interactionActive: true }));
    fireEvent.mouseMove(document.querySelector('.app-shell')!, { clientX: 40, clientY: 100 });
    expect(mocks.passthrough).not.toHaveBeenCalledWith(true);
    fireEvent.blur(window);
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ interactionActive: false }));
    hook.unmount();
  });

  it.each(['pointerup', 'pointercancel', 'dragend'])('releases input after %s', (event) => {
    const hook = renderHook(useNativeGlass);
    fireEvent.pointerDown(document.querySelector('.glass-window-panel')!);
    fireEvent(window, new Event(event));
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ interactionActive: false }));
    hook.unmount();
  });
});
