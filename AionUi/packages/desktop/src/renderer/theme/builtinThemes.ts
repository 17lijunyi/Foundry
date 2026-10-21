/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { LIGHT_THEME_ID, DARK_THEME_ID, GLASS_THEME_ID } from '@/common/theme/constants';

const T0 = 0;

// Official surfaces: solid Light, solid Dark, and translucent Glass. "Follow system"
// (the System sentinel is resolved to Light/Dark in resolveActiveTheme, not listed here).
// The former decorative community skins were deprecated and removed; a persisted
// activeId that still points at one resolves to Light via resolveActiveTheme.
export const BUILTIN_THEMES: Theme[] = [
  {
    id: LIGHT_THEME_ID,
    name: 'Light',
    appearance: 'light',
    surface: 'solid',
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  {
    id: DARK_THEME_ID,
    name: 'Dark',
    appearance: 'dark',
    surface: 'solid',
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
  {
    id: GLASS_THEME_ID,
    name: 'Glass',
    appearance: 'light',
    surface: 'glass',
    builtin: true,
    created_at: T0,
    updated_at: T0,
  },
];

export const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map((t) => t.id));
