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

import { app, BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { ipcBridge } from '@/common';
import type { GlassRegion } from '@/common/adapter/ipcBridge';
import { getCloseToTrayEnabled, getIsQuitting } from '@process/utils/tray';

type NativeGlass = { update: (handle: Buffer, payload: string) => boolean };
let nativeGlass: NativeGlass | null | undefined;
const glassWindows = new WeakSet<BrowserWindow>();
const glassButtonPositions = new WeakMap<BrowserWindow, { x: number; y: number }>();
let glassWindow: BrowserWindow | undefined;
type PointerState = {
  regions: GlassRegion[];
  geometryKnown: boolean;
  interactionActive: boolean;
  ignoring: boolean;
  timer?: ReturnType<typeof setInterval>;
};
const pointerStates = new WeakMap<BrowserWindow, PointerState>();

function validRegions(regions: unknown, maximum: number): regions is GlassRegion[] {
  return (
    Array.isArray(regions) &&
    regions.length <= maximum &&
    Array.from(regions).every((region: Partial<GlassRegion> | null) => {
      if (!region || typeof region !== 'object') return false;
      return (
        [region.x, region.y, region.width, region.height, region.radius].every(
          (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000
        ) &&
        region.width! >= 0 &&
        region.height! >= 0 &&
        region.radius! >= 0
      );
    })
  );
}

function insideRegion(x: number, y: number, region: GlassRegion): boolean {
  if (region.width === 0 || region.height === 0) return false;
  if (x < region.x || y < region.y || x > region.x + region.width || y > region.y + region.height) return false;
  const radius = Math.min(region.radius, region.width / 2, region.height / 2);
  const nearestX = Math.max(region.x + radius, Math.min(x, region.x + region.width - radius));
  const nearestY = Math.max(region.y + radius, Math.min(y, region.y + region.height - radius));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function setPointerIgnored(window: BrowserWindow, state: PointerState, ignore: boolean): void {
  if (window.isDestroyed() || state.ignoring === ignore) return;
  window.setIgnoreMouseEvents(ignore, { forward: true });
  state.ignoring = ignore;
}

function stopPointerTracking(window: BrowserWindow, forget = false): void {
  const state = pointerStates.get(window);
  if (!state) return;
  if (state.timer) clearInterval(state.timer);
  state.timer = undefined;
  state.interactionActive = false;
  setPointerIgnored(window, state, false);
  if (forget) pointerStates.delete(window);
}

/** Keep hit testing reliable while another app is focused and Chromium misses mousemove events. */
function synchronizePointer(window: BrowserWindow): void {
  const state = pointerStates.get(window);
  if (!state) return;
  if (window.isDestroyed() || !window.isVisible() || window.isMinimized()) {
    stopPointerTracking(window);
    return;
  }
  const bounds = window.getContentBounds();
  const cursor = screen.getCursorScreenPoint();
  const zoom = window.webContents.getZoomFactor();
  const x = cursor.x - bounds.x;
  const y = cursor.y - bounds.y;
  // Preserve the resize border and never change an in-progress drag into a click-through.
  const insideCanvas = x >= 6 && y >= 6 && x <= bounds.width - 6 && y <= bounds.height - 6;
  const ignore =
    insideCanvas &&
    !state.interactionActive &&
    Number.isFinite(zoom) &&
    zoom > 0 &&
    state.regions.length > 0 &&
    !state.regions.some((region) => insideRegion(x / zoom, y / zoom, region));
  setPointerIgnored(window, state, ignore);
}

function startPointerTracking(window: BrowserWindow): void {
  const state = pointerStates.get(window);
  if (!state || !state.regions.length || window.isDestroyed() || !window.isVisible() || window.isMinimized()) return;
  synchronizePointer(window);
  state.timer ??= setInterval(() => synchronizePointer(window), 32);
  state.timer.unref();
}

/** Bind glass geometry to the main window, even while a child window has focus. */
export function registerGlassWindow(window: BrowserWindow): void {
  if (glassWindow === window) return;
  if (glassWindow) stopPointerTracking(glassWindow, true);
  glassWindow = window;
  if (process.platform === 'darwin') {
    pointerStates.set(window, { regions: [], geometryKnown: false, interactionActive: false, ignoring: false });
    const resumePointerTracking = () => startPointerTracking(window);
    const pausePointerTracking = () => stopPointerTracking(window);
    const refreshPointer = () => synchronizePointer(window);
    window.on('show', resumePointerTracking);
    window.on('restore', resumePointerTracking);
    window.on('hide', pausePointerTracking);
    window.on('minimize', pausePointerTracking);
    window.on('move', refreshPointer);
    window.on('resize', refreshPointer);
    window.on('focus', refreshPointer);
    window.on('blur', () => {
      const state = pointerStates.get(window);
      if (state) state.interactionActive = false;
      synchronizePointer(window);
    });
    const resetPointerRegions = () => {
      const state = pointerStates.get(window);
      if (state) state.regions = [];
      stopPointerTracking(window);
    };
    window.webContents.on('did-start-navigation', (details) => {
      // Subframe loads and SPA navigation keep the renderer hook mounted and its
      // geometry cache intact, so only a new top-level document invalidates it.
      if (details.isMainFrame && !details.isSameDocument) resetPointerRegions();
    });
    window.webContents.on('render-process-gone', resetPointerRegions);
  }
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
    stopPointerTracking(window, true);
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
    if (!window || !payload || typeof payload.dark !== 'boolean' || !validRegions(payload.regions, 3)) return false;
    if (payload.inputRegions !== undefined && !validRegions(payload.inputRegions, 64)) return false;
    if (payload.interactionActive !== undefined && typeof payload.interactionActive !== 'boolean') return false;
    if (payload.surface !== undefined && payload.surface !== 'solid' && payload.surface !== 'glass') return false;
    const [width, height] = window.getContentSize();
    const zoom = window.webContents.getZoomFactor();
    if (!Number.isFinite(zoom) || zoom <= 0) return false;
    const state = pointerStates.get(window);
    if (state) {
      state.geometryKnown = true;
      state.regions = payload.regions.length ? [...payload.regions, ...(payload.inputRegions ?? [])] : [];
      state.interactionActive = payload.interactionActive ?? false;
      if (state.regions.length) startPointerTracking(window);
      else stopPointerTracking(window);
    }
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
    // Material visibility is independent of the window's input geometry.
    // Solid panels still leave the desktop gaps around the capsules clickable.
    const materialRegions = payload.surface === 'solid' ? [] : regions;
    const mounted =
      (glass?.update(
        window.getNativeWindowHandle(),
        JSON.stringify({ regions: materialRegions, dark: payload.dark })
      ) ??
        false) &&
      payload.surface !== 'solid';
    if (mounted && !glassWindows.has(window)) {
      glassWindows.add(window);
      console.info(`[Window] Native glass mounted on ${regions.length} surfaces (window=${window.id}).`);
    }
    return mounted;
  });
  ipcBridge.windowControls.setPointerPassthrough.provider(async (ignore) => {
    if (process.platform !== 'darwin' || typeof ignore !== 'boolean') return;
    const window = glassWindow;
    if (!window || window.isDestroyed()) return;
    const state = pointerStates.get(window);
    if (state?.geometryKnown) synchronizePointer(window);
    else if (state) setPointerIgnored(window, state, ignore);
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
