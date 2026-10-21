/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { Theme } from '@/common/theme/types';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext.tsx';
import { Button, Message, Modal } from '@arco-design/web-react';
import { EditTwo, CheckOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CssThemeModal from './CssThemeModal.tsx';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from './presets.ts';
import { BACKGROUND_BLOCK_START, injectBackgroundCssBlock } from './backgroundUtils.ts';
import { resolveExtensionAssetUrl } from '@renderer/utils/platform.ts';
import { DARK_THEME_ID, GLASS_THEME_ID, LIGHT_THEME_ID, SYSTEM_THEME_ID } from '@/common/theme/constants';

interface ThemePreviewPalette {
  appBg: string;
  headerBg: string;
  sideBg: string;
  mainBg: string;
  border: string;
  accent: string;
  textMuted: string;
  userBubble: string;
  aiBubble: string;
}

const fallbackThemePreviewPaletteByMode: Record<'light' | 'dark', ThemePreviewPalette> = {
  light: {
    appBg: '#f7f8fa',
    headerBg: '#eef1f5',
    sideBg: '#eef1f5',
    mainBg: '#f7f8fa',
    border: '#d9dde5',
    accent: '#3b82f6',
    textMuted: '#8b95a7',
    userBubble: '#dbeafe',
    aiBubble: '#e5e7eb',
  },
  dark: {
    appBg: '#171a1f',
    headerBg: '#1f242d',
    sideBg: '#1f242d',
    mainBg: '#171a1f',
    border: '#303744',
    accent: '#60a5fa',
    textMuted: '#8b95a7',
    userBubble: '#1e3a5f',
    aiBubble: '#2b313c',
  },
};

const stripImportant = (value: string) => value.replace(/\s*!important\s*/gi, '').trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeColorLike = (value: string, fallback: string) => {
  const cleaned = stripImportant(value);
  if (!cleaned) return fallback;
  if (cleaned.includes('{{') || cleaned.includes('}}')) return fallback;
  if (/var\(/i.test(cleaned)) return fallback;
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(cleaned)) {
    return `rgb(${cleaned})`;
  }
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|0?\.\d+|1)$/.test(cleaned)) {
    return `rgba(${cleaned})`;
  }
  return cleaned;
};

const parseCssVarsFromBlocks = (css: string, selector: string) => {
  if (!css) return {};
  const regex = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'gi');
  const map: Record<string, string> = {};
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = regex.exec(css)) !== null) {
    const block = blockMatch[1] || '';
    const varRegex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varRegex.exec(block)) !== null) {
      map[varMatch[1]] = varMatch[2].trim();
    }
  }
  return map;
};

const resolveCssVarValue = (value: string, vars: Record<string, string>, depth = 0): string => {
  if (!value || depth > 6) return value;
  const cleaned = stripImportant(value);
  const match = cleaned.match(/^var\(\s*--([a-zA-Z0-9-_]+)\s*(?:,\s*(.+))?\)$/);
  if (!match) return cleaned;
  const varName = match[1];
  const fallback = match[2]?.trim();
  if (vars[varName]) {
    return resolveCssVarValue(vars[varName], vars, depth + 1);
  }
  if (fallback) {
    return resolveCssVarValue(fallback, vars, depth + 1);
  }
  return cleaned;
};

const readFromVarMap = (vars: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = vars[key];
    if (value) return resolveCssVarValue(value, vars);
  }
  return '';
};

const extractThemePreviewPalette = (css: string, mode: 'light' | 'dark'): ThemePreviewPalette => {
  const modeFallback = fallbackThemePreviewPaletteByMode[mode];
  const rootVars = parseCssVarsFromBlocks(css, ':root');
  const darkVars = {
    ...parseCssVarsFromBlocks(css, "[data-theme='dark']"),
    ...parseCssVarsFromBlocks(css, '[data-theme="dark"]'),
    ...parseCssVarsFromBlocks(css, '[data-theme=dark]'),
  };
  const activeVars = mode === 'dark' ? { ...rootVars, ...darkVars } : rootVars;

  const appBgRaw = readFromVarMap(activeVars, ['bg-1', 'color-bg-1']);
  const panelBgRaw = readFromVarMap(activeVars, ['bg-2', 'color-bg-2', 'fill-1', 'color-fill-1']);
  const borderRaw = readFromVarMap(activeVars, ['bg-3', 'color-border-2', 'border-base']);
  const accentRaw = readFromVarMap(activeVars, ['color-primary', 'color-primary-base', 'primary-6']);
  const textMutedRaw = readFromVarMap(activeVars, ['color-text-3', 'text-secondary', 'color-text-2']);
  const aiBubbleRaw = readFromVarMap(activeVars, ['color-fill-2', 'fill-2', 'bg-2', 'color-bg-2']);
  const userBubbleRaw = readFromVarMap(activeVars, ['color-primary-light-3', 'color-primary-light-2', 'color-primary']);

  return {
    appBg: normalizeColorLike(appBgRaw, modeFallback.appBg),
    headerBg: normalizeColorLike(panelBgRaw, modeFallback.headerBg),
    sideBg: normalizeColorLike(panelBgRaw, modeFallback.sideBg),
    mainBg: normalizeColorLike(appBgRaw, modeFallback.mainBg),
    border: normalizeColorLike(borderRaw, modeFallback.border),
    accent: normalizeColorLike(accentRaw, modeFallback.accent),
    textMuted: normalizeColorLike(textMutedRaw, modeFallback.textMuted),
    userBubble: normalizeColorLike(userBubbleRaw, modeFallback.userBubble),
    aiBubble: normalizeColorLike(aiBubbleRaw, modeFallback.aiBubble),
  };
};

const ThemeLayoutPreview: React.FC<{ palette: ThemePreviewPalette; frosted?: boolean }> = ({
  palette,
  frosted = false,
}) => {
  const surface = (color: string) => (frosted ? `color-mix(in srgb, ${color} 55%, transparent)` : color);
  return (
    <div className='absolute inset-0 pointer-events-none' data-preview-surface={frosted ? 'glass' : 'solid'}>
      <div
        className='absolute inset-0'
        style={{
          background: frosted
            ? `radial-gradient(ellipse at 15% 15%, ${palette.accent}, transparent 65%), linear-gradient(135deg, ${palette.appBg}, ${palette.userBubble}, ${palette.textMuted})`
            : palette.appBg,
        }}
      />
      <div
        className='absolute start-8px end-8px top-8px bottom-8px rounded-8px overflow-hidden border border-solid'
        style={{
          borderColor: palette.border,
          background: surface(palette.mainBg),
          backdropFilter: frosted ? 'blur(10px) saturate(140%)' : undefined,
        }}
      >
        <div
          className='h-14px border-b border-solid flex items-center px-6px gap-4px'
          style={{ borderColor: palette.border, background: surface(palette.headerBg) }}
        >
          <span className='block w-5px h-5px rounded-full' style={{ background: palette.accent, opacity: 0.9 }}></span>
          <span
            className='block w-18px h-4px rounded-full'
            style={{ background: palette.border, opacity: 0.45 }}
          ></span>
          <span
            className='block w-12px h-4px rounded-full ms-auto'
            style={{ background: palette.border, opacity: 0.45 }}
          ></span>
        </div>
        <div style={{ height: 'calc(100% - 14px)', display: 'flex' }}>
          <div
            className='border-e border-solid px-3px py-3px flex flex-col gap-3px'
            style={{ width: '23%', borderColor: palette.border, background: surface(palette.sideBg) }}
          >
            <span className='block h-3px rounded-full' style={{ background: palette.textMuted, opacity: 0.4 }}></span>
            <span
              className='block h-3px rounded-full w-4/5'
              style={{ background: palette.textMuted, opacity: 0.33 }}
            ></span>
            <span
              className='block h-3px rounded-full w-3/5'
              style={{ background: palette.textMuted, opacity: 0.28 }}
            ></span>
          </div>
          <div
            className='border-e border-solid px-4px py-4px flex flex-col gap-4px'
            style={{ width: '54%', borderColor: palette.border, background: surface(palette.mainBg) }}
          >
            <span
              className='block h-6px rounded-[6px] w-4/5'
              style={{ background: palette.aiBubble, opacity: 0.9 }}
            ></span>
            <span
              className='block h-6px rounded-[6px] w-3/5 self-end'
              style={{ background: palette.userBubble, opacity: 0.95 }}
            ></span>
            <span
              className='block h-6px rounded-[6px] w-2/3'
              style={{ background: palette.aiBubble, opacity: 0.82 }}
            ></span>
          </div>
          <div
            className='px-3px py-3px flex flex-col gap-3px'
            style={{ width: '23%', background: surface(palette.sideBg) }}
          >
            <span className='block h-3px rounded-full' style={{ background: palette.textMuted, opacity: 0.36 }}></span>
            <span
              className='block h-3px rounded-full w-5/6'
              style={{ background: palette.textMuted, opacity: 0.3 }}
            ></span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ensureBackgroundCss = <T extends { id?: string; cover?: string; css?: string; builtin?: boolean }>(
  theme: T
): T => {
  // Skip builtin themes (Light/Dark have no decorative css to inject)
  if (theme.builtin) {
    return theme;
  }
  if (theme.cover && theme.css && !theme.css.includes(BACKGROUND_BLOCK_START)) {
    return { ...theme, css: injectBackgroundCssBlock(theme.css, theme.cover) };
  }
  return theme;
};

/**
 * CSS 主题设置组件 / CSS Theme Settings Component
 * 用于管理和切换 CSS 皮肤主题 / For managing and switching CSS skin themes
 */
const CssThemeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { activeTheme, activeId, selectTheme } = useThemeContext();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);

  const activeThemeId = activeId ?? activeTheme?.id ?? DEFAULT_THEME_ID;

  const themePreviewPalettes = useMemo(() => {
    const map = new Map<string, ThemePreviewPalette>();
    themes.forEach((cssTheme) => {
      map.set(
        cssTheme.id,
        extractThemePreviewPalette(cssTheme.css || '', cssTheme.appearance === 'dark' ? 'dark' : 'light')
      );
    });
    return map;
  }, [themes]);

  const displayThemes = useMemo(
    () =>
      themes.map((theme) => ({
        ...theme,
        name:
          theme.id === LIGHT_THEME_ID
            ? t('settings.backgroundAppearance.white')
            : theme.id === DARK_THEME_ID
              ? t('settings.backgroundAppearance.black')
              : theme.id === GLASS_THEME_ID
                ? t('settings.backgroundAppearance.glass')
                : theme.name,
      })),
    [themes, t]
  );

  // 加载主题列表 / Load theme list
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const userThemes = (configService.get('theme.userThemes') as Theme[]) ?? [];

        // Apply background CSS to user themes that have cover images
        const normalizedUserThemes = userThemes.map((theme) => ensureBackgroundCss(theme));

        // 加载扩展主题 / Load extension-contributed themes
        let extensionThemes: Theme[] = [];
        try {
          const loadedExtensionThemes = await ipcBridge.extensions.getThemes.invoke();
          // Map extension themes to Theme shape (css-only, builtin: true, appearance inferred as 'light')
          extensionThemes = loadedExtensionThemes.map((theme) => ({
            id: theme.id,
            name: theme.name,
            cover: resolveExtensionAssetUrl(theme.cover),
            css: theme.css,
            appearance: 'light' as const,
            builtin: true,
            created_at: theme.created_at ?? 0,
            updated_at: theme.updated_at ?? 0,
          }));
        } catch {
          // Extensions not available (e.g., WebUI mode or not initialized yet)
        }

        // 合并主题，按 ID 去重（先出现的优先）
        // Merge builtin, extension, and user themes; deduplicate by ID (first occurrence wins)
        const seenIds = new Set<string>();
        const allThemes: Theme[] = [];
        for (const theme of [...BUILTIN_THEMES, ...extensionThemes, ...normalizedUserThemes]) {
          if (!theme?.id || seenIds.has(theme.id)) continue;
          seenIds.add(theme.id);
          allThemes.push(theme);
        }

        setThemes(allThemes);
      } catch (error) {
        console.error('Failed to load CSS themes:', error);
      }
    };
    void loadThemes();
  }, []);

  /**
   * 选择主题 / Select theme
   */
  const handleSelectTheme = useCallback(
    async (theme: Pick<Theme, 'id' | 'name'>) => {
      try {
        await selectTheme(theme.id);
        Message.success(t('settings.cssTheme.applied', { name: theme.name }));
      } catch {
        Message.error(t('settings.cssTheme.applyFailed'));
      }
    },
    [selectTheme, t]
  );

  /**
   * 打开添加主题弹窗 / Open add theme modal
   */
  const handleAddTheme = useCallback(() => {
    setEditingTheme(null);
    setModalVisible(true);
  }, []);

  /**
   * 打开编辑主题弹窗 / Open edit theme modal
   */
  const handleEditTheme = useCallback((theme: Theme, e: Pick<Event, 'stopPropagation'>) => {
    e.stopPropagation();
    setEditingTheme(theme);
    setModalVisible(true);
  }, []);

  /**
   * 保存主题 / Save theme
   */
  const handleSaveTheme = useCallback(
    async (themeData: Omit<Theme, 'id' | 'created_at' | 'updated_at' | 'builtin'>) => {
      try {
        const now = Date.now();
        let updatedThemes: Theme[];
        const normalizedThemeData = ensureBackgroundCss({ ...themeData, builtin: false });

        let savedId: string | undefined;
        if (editingTheme && !editingTheme.builtin) {
          // 更新现有用户主题 / Update existing user theme
          savedId = editingTheme.id;
          updatedThemes = themes.map((t) => (t.id === savedId ? { ...t, ...normalizedThemeData, updated_at: now } : t));
        } else {
          // 添加新主题 / Add new theme
          const newTheme: Theme = {
            id: uuid(),
            ...normalizedThemeData,
            tokens: undefined,
            builtin: false,
            created_at: now,
            updated_at: now,
          };
          updatedThemes = [...themes, newTheme];
        }

        // 只保存用户主题 / Only save user themes — persist BEFORE re-applying so selectTheme reads updated css
        const userThemes = updatedThemes.filter((t) => !t.builtin);
        await configService.set('theme.userThemes', userThemes);

        setThemes(updatedThemes);

        // If the saved theme is the active one, re-apply to pick up changes
        if (savedId !== undefined && activeThemeId === savedId) {
          await selectTheme(savedId);
        }

        setModalVisible(false);
        setEditingTheme(null);
        Message.success(t('common.saveSuccess'));
      } catch (error) {
        console.error('Failed to save theme:', error);
        Message.error(t('common.saveFailed'));
      }
    },
    [editingTheme, themes, activeThemeId, selectTheme, t]
  );

  /**
   * 删除主题 / Delete theme
   */
  const handleDeleteTheme = useCallback(
    (themeId: string) => {
      Modal.confirm({
        title: t('common.confirmDelete'),
        content: t('settings.cssTheme.deleteConfirm'),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            const updatedThemes = themes.filter((t) => t.id !== themeId);
            const userThemes = updatedThemes.filter((t) => !t.builtin);
            await configService.set('theme.userThemes', userThemes);

            // 如果删除的是当前激活主题，回退到 Light / If deleting active theme, fall back to Light
            if (activeThemeId === themeId) {
              await selectTheme(LIGHT_THEME_ID);
            }

            setThemes(updatedThemes);
            setModalVisible(false);
            setEditingTheme(null);
            Message.success(t('common.deleteSuccess'));
          } catch (error) {
            console.error('Failed to delete theme:', error);
            Message.error(t('common.deleteFailed'));
          }
        },
      });
    },
    [themes, activeThemeId, selectTheme, t]
  );

  return (
    <div className='space-y-12px'>
      {/* 标题栏 / Header */}
      <div className='flex items-start md:items-center justify-between gap-8px flex-wrap'>
        <span className='text-14px text-t-secondary leading-22px'>{t('settings.backgroundAppearance.hint')}</span>
        <Button type='primary' size='small' className='!h-32px !rounded-8px !px-14px !m-0' onClick={handleAddTheme}>
          {t('settings.cssTheme.addManually')}
        </Button>
      </div>

      {/* 主题卡片列表 / Theme card list.
          Fixed-width cards that wrap: a full row packs several cards, while a
          short list (e.g. White/Black/Frosted Glass) stays at its natural
          size and leaves the trailing space empty instead of stretching each
          card across the whole row. */}
      <div className='flex flex-wrap gap-12px'>
        {displayThemes.map((theme) => {
          const previewPalette =
            themePreviewPalettes.get(theme.id) ||
            fallbackThemePreviewPaletteByMode[theme.appearance === 'dark' ? 'dark' : 'light'];
          const cardStyle = theme.cover
            ? {
                backgroundImage: `url(${theme.cover})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundColor: previewPalette.appBg,
              }
            : { backgroundColor: previewPalette.appBg };
          return (
            <div
              key={theme.id}
              className='relative'
              onMouseEnter={() => setHoveredThemeId(theme.id)}
              onMouseLeave={() => setHoveredThemeId(null)}
              onFocus={() => setHoveredThemeId(theme.id)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHoveredThemeId(null);
              }}
            >
              <Button
                type='text'
                data-testid={`theme-card-${theme.id}`}
                data-active={activeThemeId === theme.id}
                aria-label={theme.name}
                aria-pressed={activeThemeId === theme.id}
                className={`relative !p-0 !rounded-12px overflow-hidden !border-2 transition-all duration-200 !h-112px !w-200px flex-shrink-0 ${activeThemeId === theme.id ? '!border-[var(--color-primary)]' : '!border-transparent hover:!border-border-2'}`}
                style={cardStyle}
                onClick={() => void handleSelectTheme(theme)}
              >
                {!theme.cover && <ThemeLayoutPreview palette={previewPalette} frosted={theme.id === GLASS_THEME_ID} />}
                <span className='absolute bottom-0 start-0 end-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8px'>
                  <span className='text-13px text-white truncate flex-1 text-start'>{theme.name}</span>
                </span>
                {activeThemeId === theme.id && (
                  <span className='absolute top-8px end-8px' aria-hidden='true'>
                    <CheckOne theme='filled' size='20' fill='var(--color-primary)' />
                  </span>
                )}
              </Button>
              {hoveredThemeId === theme.id && !theme.builtin && (
                <Button
                  type='text'
                  size='mini'
                  className='!absolute bottom-8px end-8px !rounded-6px !bg-white/20 hover:!bg-white/40'
                  aria-label={t('common.edit')}
                  icon={<EditTwo size={16} fill='currentColor' />}
                  onClick={(event) => handleEditTheme(theme, event)}
                />
              )}
            </div>
          );
        })}
      </div>

      <Button
        type={activeThemeId === SYSTEM_THEME_ID ? 'secondary' : 'text'}
        size='small'
        aria-pressed={activeThemeId === SYSTEM_THEME_ID}
        onClick={() => void handleSelectTheme({ id: SYSTEM_THEME_ID, name: t('settings.cssTheme.followSystem') })}
      >
        {t('settings.cssTheme.followSystem')}
      </Button>

      {/* 主题编辑弹窗 / Theme edit modal */}
      <CssThemeModal
        visible={modalVisible}
        theme={editingTheme}
        onClose={() => {
          setModalVisible(false);
          setEditingTheme(null);
        }}
        onSave={handleSaveTheme}
        onDelete={editingTheme && !editingTheme.builtin ? () => handleDeleteTheme(editingTheme.id) : undefined}
      />
    </div>
  );
};

export default CssThemeSettings;
