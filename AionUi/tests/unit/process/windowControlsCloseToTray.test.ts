/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression: custom title-bar close IPC must hide when close-to-tray is on
 * (Linux frameless path), instead of always calling window.close().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { GlassRegion } from '@/common/adapter/ipcBridge';
import Module from 'node:module';

const nativeModuleLoader = Module as typeof Module & { _load: (id: string, ...args: unknown[]) => unknown };

const hide = vi.fn();
const close = vi.fn();
const minimize = vi.fn();
const maximize = vi.fn();
const unmaximize = vi.fn();
const isMaximized = vi.fn(() => false);
const isDestroyed = vi.fn(() => false);
const handlers = new Map<string, (() => void)[]>();
type NavigationDetails = { isMainFrame: boolean; isSameDocument: boolean };
const contentHandlers = new Map<string, ((details?: NavigationDetails) => void)[]>();
const on = vi.fn((event: string, handler: () => void) => {
  handlers.set(event, [...(handlers.get(event) ?? []), handler]);
});
const once = vi.fn((event: string, handler: () => void) => {
  handlers.set(event, [...(handlers.get(event) ?? []), handler]);
});
const setIgnoreMouseEvents = vi.fn();
const isVisible = vi.fn(() => true);
const isMinimized = vi.fn(() => false);
const getContentBounds = vi.fn(() => ({ x: 100, y: 200, width: 1000, height: 800 }));
const getZoomFactor = vi.fn(() => 1);
const getCursorScreenPoint = vi.fn(() => ({ x: 130, y: 300 }));

const mockWindow = {
  hide,
  close,
  minimize,
  maximize,
  unmaximize,
  isMaximized,
  isDestroyed,
  on,
  once,
  setIgnoreMouseEvents,
  isVisible,
  isMinimized,
  getContentBounds,
  getContentSize: () => [1000, 800],
  getNativeWindowHandle: () => Buffer.alloc(8),
  setWindowButtonVisibility: vi.fn(),
  setWindowButtonPosition: vi.fn(),
  webContents: {
    getZoomFactor,
    on: (event: string, handler: (details?: NavigationDetails) => void) => {
      contentHandlers.set(event, [...(contentHandlers.get(event) ?? []), handler]);
    },
  },
};

const getFocusedWindow = vi.fn(() => mockWindow);
// Empty by default so init does not register maximize listeners on a live list.
const getAllWindows = vi.fn(() => [] as (typeof mockWindow)[]);

vi.mock('electron', () => ({
  app: { getAppPath: () => '/unavailable-native-glass-test' },
  screen: { getCursorScreenPoint: () => getCursorScreenPoint() },
  BrowserWindow: {
    getFocusedWindow: () => getFocusedWindow(),
    getAllWindows: () => getAllWindows(),
  },
}));

const getCloseToTrayEnabled = vi.fn(() => false);
const getIsQuitting = vi.fn(() => false);

vi.mock('@process/utils/tray', () => ({
  getCloseToTrayEnabled: () => getCloseToTrayEnabled(),
  getIsQuitting: () => getIsQuitting(),
}));

type ProviderFn = () => Promise<void> | void;
const providers: Record<string, ProviderFn> = {};
let passthroughProvider: (ignore: boolean) => Promise<void>;
let updateGlassProvider: (payload: unknown) => Promise<boolean>;

vi.mock('@/common', () => ({
  ipcBridge: {
    windowControls: {
      updateGlass: { provider: (fn: typeof updateGlassProvider) => (updateGlassProvider = fn) },
      setPointerPassthrough: { provider: (fn: typeof passthroughProvider) => (passthroughProvider = fn) },
      minimize: { provider: (fn: ProviderFn) => (providers.minimize = fn) },
      maximize: { provider: (fn: ProviderFn) => (providers.maximize = fn) },
      unmaximize: { provider: (fn: ProviderFn) => (providers.unmaximize = fn) },
      close: { provider: (fn: ProviderFn) => (providers.close = fn) },
      isMaximized: { provider: (fn: ProviderFn) => (providers.isMaximized = fn) },
      maximizedChanged: { emit: vi.fn() },
    },
  },
}));

describe('windowControlsBridge close-to-tray', () => {
  beforeEach(async () => {
    vi.resetModules();
    hide.mockClear();
    close.mockClear();
    minimize.mockClear();
    on.mockClear();
    once.mockClear();
    handlers.clear();
    contentHandlers.clear();
    setIgnoreMouseEvents.mockClear();
    getFocusedWindow.mockReset();
    getFocusedWindow.mockReturnValue(mockWindow);
    getAllWindows.mockReset();
    getAllWindows.mockReturnValue([]);
    getCloseToTrayEnabled.mockReturnValue(false);
    getIsQuitting.mockReturnValue(false);
    isDestroyed.mockReturnValue(false);

    const { initWindowControlsBridge } = await import('@/process/bridge/windowControlsBridge');
    initWindowControlsBridge();
  });

  it('hides the window when close-to-tray is enabled and app is not quitting', async () => {
    getCloseToTrayEnabled.mockReturnValue(true);
    getIsQuitting.mockReturnValue(false);

    await providers.close();

    expect(hide).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the window when close-to-tray is disabled', async () => {
    getCloseToTrayEnabled.mockReturnValue(false);

    await providers.close();

    expect(close).toHaveBeenCalledTimes(1);
    expect(hide).not.toHaveBeenCalled();
  });

  it('closes the window when app is quitting even if close-to-tray is enabled', async () => {
    getCloseToTrayEnabled.mockReturnValue(true);
    getIsQuitting.mockReturnValue(true);

    await providers.close();

    expect(close).toHaveBeenCalledTimes(1);
    expect(hide).not.toHaveBeenCalled();
  });

  it('falls back to the first live window when nothing is focused', async () => {
    getFocusedWindow.mockReturnValue(null);
    getAllWindows.mockReturnValue([mockWindow]);
    getCloseToTrayEnabled.mockReturnValue(true);

    await providers.close();

    expect(hide).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it.runIf(process.platform === 'darwin')(
    'keeps transparent-area input bound to the main window when a child is focused',
    async () => {
      const { registerGlassWindow } = await import('@/process/bridge/windowControlsBridge');
      registerGlassWindow(mockWindow as unknown as BrowserWindow);
      const childPassthrough = vi.fn();
      getFocusedWindow.mockReturnValue({ ...mockWindow, setIgnoreMouseEvents: childPassthrough });
      await passthroughProvider(true);
      expect(setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
      expect(childPassthrough).not.toHaveBeenCalled();
    }
  );

  it.runIf(process.platform === 'darwin')(
    'ignores late pointer events after the main window is destroyed',
    async () => {
      const { registerGlassWindow } = await import('@/process/bridge/windowControlsBridge');
      registerGlassWindow(mockWindow as unknown as BrowserWindow);
      isDestroyed.mockReturnValue(true);
      await passthroughProvider(false);
      expect(setIgnoreMouseEvents).not.toHaveBeenCalled();
    }
  );
});

describe.runIf(process.platform === 'darwin')('transparent glass window input', () => {
  const panel: GlassRegion = { x: 100, y: 30, width: 720, height: 600, radius: 30 };
  const geometry = (extra = {}) => ({ regions: [panel], dark: false, ...extra });
  const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler());

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    handlers.clear();
    contentHandlers.clear();
    isDestroyed.mockReturnValue(false);
    isVisible.mockReturnValue(true);
    isMinimized.mockReturnValue(false);
    getAllWindows.mockReturnValue([]);
    getContentBounds.mockReturnValue({ x: 100, y: 200, width: 1000, height: 800 });
    getZoomFactor.mockReturnValue(1);
    getCursorScreenPoint.mockReturnValue({ x: 130, y: 300 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { initWindowControlsBridge, registerGlassWindow } = await import('@/process/bridge/windowControlsBridge');
    registerGlassWindow(mockWindow as unknown as BrowserWindow);
    initWindowControlsBridge();
  });

  afterEach(() => {
    emit('closed');
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes transparent space through immediately even when native glass is unavailable', async () => {
    expect(await updateGlassProvider(geometry())).toBe(false);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it('removes native materials for a solid surface while keeping transparent gaps clickable', async () => {
    const update = vi.fn((_handle: Buffer, _payload: string) => true);
    const load = nativeModuleLoader._load;
    vi.spyOn(nativeModuleLoader, '_load').mockImplementation((id, ...args) =>
      id === '/unavailable-native-glass-test/out/main/native/glass.node' ? { update } : load(id, ...args)
    );
    expect(await updateGlassProvider(geometry({ surface: 'solid' }))).toBe(false);
    expect(JSON.parse(update.mock.calls[0][1])).toEqual({ regions: [], dark: false });
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it('restores all native materials after switching back to glass', async () => {
    const update = vi.fn((_handle: Buffer, _payload: string) => true);
    const load = nativeModuleLoader._load;
    vi.spyOn(nativeModuleLoader, '_load').mockImplementation((id, ...args) =>
      id === '/unavailable-native-glass-test/out/main/native/glass.node' ? { update } : load(id, ...args)
    );
    const regions = [
      panel,
      { x: 20, y: 250, width: 50, height: 300, radius: 25 },
      { x: 400, y: 700, width: 200, height: 50, radius: 25 },
    ];
    await updateGlassProvider(geometry({ surface: 'solid', regions }));
    expect(await updateGlassProvider(geometry({ surface: 'glass', regions }))).toBe(true);
    expect(JSON.parse(update.mock.lastCall![1])).toEqual({ regions, dark: false });
  });

  it('preserves panel input and titlebar placement when native materials are disabled', async () => {
    await updateGlassProvider(geometry({ surface: 'solid' }));
    getCursorScreenPoint.mockReturnValue({ x: 240, y: 300 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(mockWindow.setWindowButtonPosition).toHaveBeenLastCalledWith({ x: 118, y: 46 });
  });

  it('preserves popover input in solid mode even without a native material module', async () => {
    await updateGlassProvider(geometry({ surface: 'solid' }));
    await updateGlassProvider(
      geometry({ surface: 'solid', inputRegions: [{ x: 10, y: 80, width: 80, height: 100, radius: 8 }] })
    );
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it.each(['transparent', '', null, false, 0])(
    'rejects an unknown surface without changing input (%j)',
    async (surface) => {
      expect(await updateGlassProvider(geometry({ surface }))).toBe(false);
      expect(setIgnoreMouseEvents).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('restores panel input from real cursor coordinates without receiving a renderer mousemove', async () => {
    await updateGlassProvider(geometry());
    getCursorScreenPoint.mockReturnValue({ x: 240, y: 300 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('keeps polling while another application has focus', async () => {
    await updateGlassProvider(geometry());
    emit('blur');
    getCursorScreenPoint.mockReturnValue({ x: 240, y: 300 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('ignores a delayed renderer instruction when the cursor has already returned to the panel', async () => {
    await updateGlassProvider(geometry());
    getCursorScreenPoint.mockReturnValue({ x: 240, y: 300 });
    await passthroughProvider(true);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('preserves a capsule button while its surrounding transparent area passes through', async () => {
    await updateGlassProvider(geometry({ regions: [panel, { x: 20, y: 250, width: 50, height: 300, radius: 25 }] }));
    getCursorScreenPoint.mockReturnValue({ x: 145, y: 500 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('passes the visually transparent rounded corner through', async () => {
    getCursorScreenPoint.mockReturnValue({ x: 201, y: 231 });
    await updateGlassProvider(geometry());
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    getCursorScreenPoint.mockReturnValue({ x: 230, y: 231 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('keeps a portal menu outside the main panel clickable', async () => {
    await updateGlassProvider(geometry());
    await updateGlassProvider(geometry({ inputRegions: [{ x: 10, y: 80, width: 80, height: 100, radius: 8 }] }));
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('keeps a full-window modal backdrop blocking clicks to applications behind it', async () => {
    await updateGlassProvider(geometry());
    await updateGlassProvider(geometry({ inputRegions: [{ x: 0, y: 0, width: 1000, height: 800, radius: 0 }] }));
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('uses current window position without waiting for renderer geometry', async () => {
    await updateGlassProvider(geometry());
    getContentBounds.mockReturnValue({ x: 0, y: 200, width: 1000, height: 800 });
    emit('move');
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('converts screen coordinates using the current content zoom', async () => {
    await updateGlassProvider(geometry());
    getCursorScreenPoint.mockReturnValue({ x: 270, y: 300 });
    getZoomFactor.mockReturnValue(2);
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    getCursorScreenPoint.mockReturnValue({ x: 370, y: 300 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it.each([
    ['left', 103, 300],
    ['top', 130, 203],
    ['right', 1097, 300],
    ['bottom', 130, 997],
    ['outside', 90, 300],
  ])('preserves native resize input at the %s edge', async (_edge, x, y) => {
    await updateGlassProvider(geometry());
    getCursorScreenPoint.mockReturnValue({ x: x as number, y: y as number });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('retains input until an in-progress drag finishes', async () => {
    await updateGlassProvider(geometry());
    await updateGlassProvider(geometry({ interactionActive: true }));
    vi.advanceTimersByTime(64);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    await updateGlassProvider(geometry({ interactionActive: false }));
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it.each(['hide', 'minimize'])('restores normal input and suspends polling on %s', async (event) => {
    await updateGlassProvider(geometry());
    emit(event);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['show', 'restore'])('resumes coordinate tracking on %s', async (event) => {
    await updateGlassProvider(geometry());
    emit('hide');
    emit(event);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('restores input and rejects stale passthrough commands when glass is unmounted', async () => {
    await updateGlassProvider(geometry());
    await updateGlassProvider({ regions: [], dark: false });
    await passthroughProvider(true);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores input when the renderer crashes', async () => {
    await updateGlassProvider(geometry());
    contentHandlers.get('render-process-gone')?.forEach((handler) => handler());
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores input when navigation replaces the main renderer document', async () => {
    await updateGlassProvider(geometry());
    contentHandlers
      .get('did-start-navigation')
      ?.forEach((handler) => handler({ isMainFrame: true, isSameDocument: false }));
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['an iframe navigation', { isMainFrame: false, isSameDocument: false }],
    ['a same-document route change', { isMainFrame: true, isSameDocument: true }],
  ] as const)('retains click-through geometry during %s', async (_description, details) => {
    await updateGlassProvider(geometry());
    contentHandlers.get('did-start-navigation')?.forEach((handler) => handler(details));
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    getCursorScreenPoint.mockReturnValue({ x: 240, y: 300 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('stops polling when the native window is destroyed', async () => {
    await updateGlassProvider(geometry());
    setIgnoreMouseEvents.mockClear();
    isDestroyed.mockReturnValue(true);
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for a hidden window to become visible before polling', async () => {
    isVisible.mockReturnValue(false);
    await updateGlassProvider(geometry());
    expect(vi.getTimerCount()).toBe(0);
    isVisible.mockReturnValue(true);
    emit('show');
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it('leaves the last valid hit regions intact when an invalid update arrives', async () => {
    await updateGlassProvider(geometry());
    expect(await updateGlassProvider(geometry({ inputRegions: [null] }))).toBe(false);
    getCursorScreenPoint.mockReturnValue({ x: 240, y: 300 });
    vi.advanceTimersByTime(32);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
  });

  it('rejects a malformed drag state without starting passthrough', async () => {
    expect(await updateGlassProvider(geometry({ interactionActive: 'false' }))).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    null,
    'invalid',
    [null],
    Array(1),
    [{ ...panel, x: Number.NaN }],
    [{ ...panel, height: Number.POSITIVE_INFINITY }],
    [{ ...panel, width: -1 }],
    [{ ...panel, radius: -1 }],
    [{ ...panel, width: 1_000_001 }],
    Array.from({ length: 65 }, () => panel),
  ])('rejects malformed input geometry without starting passthrough (%j)', async (inputRegions) => {
    expect(await updateGlassProvider(geometry({ inputRegions }))).toBe(false);
    expect(setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
