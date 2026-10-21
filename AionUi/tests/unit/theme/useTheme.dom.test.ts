import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@/common/theme/types';

const { changedOnMock, configGetMock, setActiveThemeMock } = vi.hoisted(() => ({
  changedOnMock: vi.fn(() => vi.fn()),
  configGetMock: vi.fn(),
  setActiveThemeMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      changed: { on: changedOnMock },
    },
  },
}));

vi.mock('@/renderer/utils/theme/applyTheme', () => ({
  applyTheme: vi.fn(),
  seedElectronTheme: vi.fn().mockResolvedValue(undefined),
  setActiveTheme: setActiveThemeMock,
}));

vi.mock('@/renderer/utils/theme/systemThemeWatcher', () => ({
  startSystemThemeWatcher: vi.fn(() => vi.fn()),
}));

const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  appearance: 'dark',
  surface: 'solid',
  builtin: true,
  created_at: 0,
  updated_at: 0,
};
const glassTheme: Theme = { ...darkTheme, id: 'glass', name: 'Glass', appearance: 'light', surface: 'glass' };

describe('useTheme selection', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    configGetMock.mockImplementation((key: string) => {
      if (key === 'theme.activeId') return 'light';
      if (key === 'theme.userThemes') return [];
      return undefined;
    });
    setActiveThemeMock.mockReset();
  });

  afterEach(cleanup);

  it('updates local theme state without waiting for a cross-window event', async () => {
    const { default: useTheme } = await import('@/renderer/hooks/system/useTheme');
    setActiveThemeMock.mockResolvedValue(darkTheme);
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current[0]?.appearance).toBe('light'));
    await act(async () => result.current[1]('dark'));

    expect(result.current[0]?.appearance).toBe('dark');
    expect(result.current[2]).toBe('dark');
    expect(localStorage.getItem('__aionui_theme')).toBe('dark');
    expect(localStorage.getItem('__aionui_surface')).toBe('solid');
  });

  it('keeps the current state when selecting a theme fails', async () => {
    const { default: useTheme } = await import('@/renderer/hooks/system/useTheme');
    setActiveThemeMock.mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current[0]?.appearance).toBe('light'));
    await expect(act(async () => result.current[1]('dark'))).rejects.toThrow('save failed');

    expect(result.current[0]?.appearance).toBe('light');
    expect(localStorage.getItem('__aionui_surface')).toBe('solid');
  });

  it('caches the glass surface when selected for the next app launch', async () => {
    const { default: useTheme } = await import('@/renderer/hooks/system/useTheme');
    setActiveThemeMock.mockResolvedValue(glassTheme);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]?.id).toBe('light'));
    await act(async () => result.current[1]('glass'));

    expect(result.current[2]).toBe('glass');
    expect(localStorage.getItem('__aionui_surface')).toBe('glass');
  });

  it('restores a saved glass choice after restarting the renderer', async () => {
    configGetMock.mockImplementation((key: string) => (key === 'theme.activeId' ? 'glass' : []));
    const { default: useTheme } = await import('@/renderer/hooks/system/useTheme');
    const { result } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current[0]?.surface).toBe('glass'));
    expect(result.current[2]).toBe('glass');
    expect(localStorage.getItem('__aionui_surface')).toBe('glass');
  });
});
