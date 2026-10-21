/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { resolveActiveTheme } from '@/common/theme/resolveTheme';
import { LIGHT_THEME_ID } from '@/common/theme/constants';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';
import { processCustomCss } from './customCssProcessor';
import { tokensToCss } from './tokensToCss';
import { getSystemPrefersDark } from './systemAppearance';

const TOKENS_STYLE_ID = 'theme-tokens';
const DECORATION_STYLE_ID = 'theme-decoration';
let selectionQueue: Promise<unknown> = Promise.resolve();

function upsertStyle(id: string, css: string | null, root: Document = document): void {
  const existing = root.getElementById(id);
  if (!css) {
    existing?.remove();
    return;
  }
  const el = (existing as HTMLStyleElement | null) ?? root.createElement('style');
  el.id = id;
  el.textContent = css;
  root.head.appendChild(el); // (re)append to keep it last in <head>
}

function isElectronRenderer(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { electronAPI?: unknown }).electronAPI);
}

async function publishThemeToElectron(theme: Theme): Promise<void> {
  if (!isElectronRenderer()) return;
  await ipcBridge.theme.setActive.invoke(theme);
}

/**
 * Write the two appearance attributes as one coupled unit:
 *  - `data-theme` on `<html>` drives our own design tokens
 *  - `arco-theme` on `<body>` drives Arco's color scales and the
 *    `body[arco-theme='dark']` overrides in arco-override.css
 *
 * Both must stay in sync or dark mode splits (our tokens go dark while Arco
 * stays light). `<html>` always exists; `<body>` can be null during early boot
 * (`readyState === 'loading'`). In that case we must NOT silently skip the
 * `arco-theme` write — defer it to DOMContentLoaded so the two attributes still
 * converge once the body is parsed.
 */
function applyAppearanceAttributes(root: Document, appearance: Theme['appearance']): void {
  root.documentElement.setAttribute('data-theme', appearance);
  if (root.body) {
    root.body.setAttribute('arco-theme', appearance);
    return;
  }
  root.addEventListener(
    'DOMContentLoaded',
    () => {
      root.body?.setAttribute('arco-theme', appearance);
    },
    { once: true }
  );
}

/** Apply a resolved theme to a document. Used by every app-chrome surface. */
export function applyTheme(theme: Theme, root: Document = document): void {
  applyAppearanceAttributes(root, theme.appearance);
  root.documentElement.setAttribute('data-surface', theme.surface ?? 'glass');
  upsertStyle(TOKENS_STYLE_ID, tokensToCss(theme.tokens), root);
  upsertStyle(DECORATION_STYLE_ID, theme.css ? processCustomCss(theme.css) : null, root);
}

async function saveAndApplyTheme(activeId: string): Promise<Theme> {
  const userThemes = (configService.get('theme.userThemes') as Theme[] | undefined) ?? [];
  const resolved = resolveActiveTheme(activeId, [...BUILTIN_THEMES, ...userThemes], getSystemPrefersDark());
  const previousId = (configService.get('theme.activeId') as string | undefined) || LIGHT_THEME_ID;
  try {
    await configService.set('theme.activeId', activeId);
  } catch (error) {
    // ConfigService updates its memory cache optimistically. Restore only this
    // selection so a later successful choice is not overwritten by a failed save.
    if (configService.get('theme.activeId') === activeId) {
      configService.setLocal('theme.activeId', previousId);
    }
    throw error;
  }
  applyTheme(resolved);
  // The selection is already saved. A relay failure must not leave the local
  // selected card and startup cache behind the successfully applied surface.
  await publishThemeToElectron(resolved).catch((error) => console.warn('theme broadcast failed', error));
  return resolved;
}

/** Save choices in order, keeping failed saves from changing the visible surface. */
export function setActiveTheme(activeId: string): Promise<Theme> {
  const selection = selectionQueue.then(() => saveAndApplyTheme(activeId));
  selectionQueue = selection.catch(() => {});
  return selection;
}

/** Seed Electron's cross-window theme relay. WebUI has no Electron surfaces to notify. */
export async function seedElectronTheme(theme: Theme): Promise<void> {
  await publishThemeToElectron(theme);
}
