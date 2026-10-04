/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression: custom title-bar close IPC must hide when close-to-tray is on
 * (Linux frameless path), instead of always calling window.close().
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const hide = vi.fn();
const close = vi.fn();
const minimize = vi.fn();
const maximize = vi.fn();
const unmaximize = vi.fn();
const isMaximized = vi.fn(() => false);
const isDestroyed = vi.fn(() => false);
const on = vi.fn();
const setIgnoreMouseEvents = vi.fn();

const mockWindow = {
  hide,
  close,
  minimize,
  maximize,
  unmaximize,
  isMaximized,
  isDestroyed,
  on,
  once: vi.fn(),
  setIgnoreMouseEvents,
};

const getFocusedWindow = vi.fn(() => mockWindow);
// Empty by default so init does not register maximize listeners on a live list.
const getAllWindows = vi.fn(() => [] as (typeof mockWindow)[]);

vi.mock('electron', () => ({
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

vi.mock('@/common', () => ({
  ipcBridge: {
    windowControls: {
      updateGlass: { provider: vi.fn() },
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
