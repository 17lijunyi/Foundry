/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 窗口控制桥接模块
 * Window Controls Bridge Module
 *
 * 负责处理窗口的最小化、最大化、关闭等控制操作
 * Handles window minimize, maximize, close and other control operations
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { ipcBridge } from '@/common';
import { getCloseToTrayEnabled, getIsQuitting } from '@process/utils/tray';

type NativeGlass = { update: (handle: Buffer, payload: string) => boolean };
let nativeGlass: NativeGlass | null | undefined;
const glassWindows = new WeakSet<BrowserWindow>();
const glassButtonPositions = new WeakMap<BrowserWindow, { x: number; y: number }>();
let glassWindow: BrowserWindow | undefined;

/** Bind glass geometry to the main window, even while a child window has focus. */
export function registerGlassWindow(window: BrowserWindow): void {
  glassWindow = window;
  // macOS redraws the traffic lights after native zoom/live-resize callbacks.
  const restoreButtons = () =>
    setImmediate(() => {
      const position = glassButtonPositions.get(window);
      if (position && !window.isDestroyed()) window.setWindowButtonPosition(position);
    });
  window.on('resized', restoreButtons);
  window.on('maximize', restoreButtons);
  window.on('unmaximize', restoreButtons);
  window.once('closed', () => {
    if (glassWindow === window) glassWindow = undefined;
  });
}

function loadNativeGlass(): NativeGlass | null {
  if (nativeGlass !== undefined) return nativeGlass;
  try {
    nativeGlass = require(path.join(app.getAppPath(), 'out/main/native/glass.node')) as NativeGlass;
  } catch (error) {
    console.warn('[Window] Native glass unavailable; using the readable surface fallback.', error);
    nativeGlass = null;
  }
  return nativeGlass;
}

/**
 * Resolve the window targeted by title-bar controls.
 * Prefer the focused window; fall back to the first live window so Linux
 * frameless close still works when focus is momentarily lost.
 */
function resolveControlWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }
  const fallback = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
  return fallback ?? null;
}

/**
 * 为指定窗口注册最大化状态监听器
 * Register maximize state listeners for a specific window
 *
 * @param window - 要监听的 BrowserWindow 实例 / BrowserWindow instance to listen to
 */
export function registerWindowMaximizeListeners(window: BrowserWindow): void {
  // 当窗口最大化时通知渲染进程 / Notify renderer when window is maximized
  window.on('maximize', () => {
    ipcBridge.windowControls.maximizedChanged.emit({ is_maximized: true });
  });

  // 当窗口取消最大化时通知渲染进程 / Notify renderer when window is unmaximized
  window.on('unmaximize', () => {
    ipcBridge.windowControls.maximizedChanged.emit({ is_maximized: false });
  });
}

/**
 * 初始化窗口控制桥接
 * Initialize window controls bridge
 *
 * 注册 IPC 处理器以响应来自渲染进程的窗口控制请求
 * Register IPC handlers to respond to window control requests from renderer process
 */
export function initWindowControlsBridge(): void {
  ipcBridge.windowControls.updateGlass.provider(async (payload) => {
    if (process.platform !== 'darwin') return false;
    const window = glassWindow;
    if (window?.isDestroyed()) return false;
    if (!window || !payload || typeof payload.dark !== 'boolean' || !Array.isArray(payload.regions)) return false;
    if (payload.regions.length > 3) return false;
    const [width, height] = window.getContentSize();
    const zoom = window.webContents.getZoomFactor();
    if (
      payload.regions.some(
        (region) =>
          !region ||
          ![region.x, region.y, region.width, region.height, region.radius].every(Number.isFinite) ||
          region.width < 0 ||
          region.height < 0 ||
          region.radius < 0
      )
    )
      return false;
    const regions = payload.regions.map((region) => ({
      x: Math.max(0, Math.min(width, region.x * zoom)),
      y: Math.max(0, Math.min(height, region.y * zoom)),
      width: Math.min(width, region.width * zoom),
      height: Math.min(height, region.height * zoom),
      radius: Math.min(80, region.radius * zoom),
    }));
    const panel = regions[0];
    if (panel) {
      const position = { x: Math.round(panel.x + 18), y: Math.round(panel.y + 16) };
      glassButtonPositions.set(window, position);
      window.setWindowButtonVisibility(true);
      window.setWindowButtonPosition(position);
    }
    const glass = loadNativeGlass();
    const mounted =
      glass?.update(window.getNativeWindowHandle(), JSON.stringify({ regions, dark: payload.dark })) ?? false;
    if (mounted && !glassWindows.has(window)) {
      glassWindows.add(window);
      console.info(`[Window] Native glass mounted on ${regions.length} surfaces (window=${window.id}).`);
    }
    return mounted;
  });
  ipcBridge.windowControls.setPointerPassthrough.provider(async (ignore) => {
    if (process.platform !== 'darwin' || typeof ignore !== 'boolean') return;
    if (glassWindow && !glassWindow.isDestroyed()) glassWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // 最小化窗口 / Minimize window
  ipcBridge.windowControls.minimize.provider(() => {
    const window = resolveControlWindow();
    if (window) {
      window.minimize();
    }
    return Promise.resolve();
  });

  // 最大化窗口 / Maximize window
  ipcBridge.windowControls.maximize.provider(() => {
    const window = resolveControlWindow();
    if (window) {
      window.maximize();
    }
    return Promise.resolve();
  });

  // 取消最大化窗口 / Unmaximize window
  ipcBridge.windowControls.unmaximize.provider(() => {
    const window = resolveControlWindow();
    if (window) {
      window.unmaximize();
    }
    return Promise.resolve();
  });

  // 关闭窗口 / Close window
  // Custom title-bar close (Linux frameless, etc.) goes through this IPC path.
  // Honor close-to-tray here so we hide instead of destroying the window —
  // relying only on the BrowserWindow 'close' interceptor is not enough on
  // all Linux desktop environments when the close originates from renderer IPC.
  ipcBridge.windowControls.close.provider(() => {
    const window = resolveControlWindow();
    if (!window) {
      return Promise.resolve();
    }
    if (getCloseToTrayEnabled() && !getIsQuitting()) {
      window.hide();
    } else {
      window.close();
    }
    return Promise.resolve();
  });

  // 获取窗口是否最大化状态 / Get window maximized state
  ipcBridge.windowControls.isMaximized.provider(() => {
    const window = resolveControlWindow();
    return Promise.resolve(window?.isMaximized() ?? false);
  });

  // 为所有已存在的窗口注册监听器 / Register listeners for all existing windows
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((window) => {
    registerWindowMaximizeListeners(window);
  });
}
