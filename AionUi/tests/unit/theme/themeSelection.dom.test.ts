import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { configGetMock, configSetMock, configSetLocalMock, publishMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  configSetLocalMock: vi.fn(),
  publishMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    set: configSetMock,
    setLocal: configSetLocalMock,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      setActive: { invoke: publishMock },
    },
  },
}));

import { applyTheme, setActiveTheme } from '@/renderer/utils/theme/applyTheme';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';

type BrowserWindow = Window & { electronAPI?: unknown };

describe('setActiveTheme', () => {
  let activeId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    activeId = 'light';
    configGetMock.mockImplementation((key: string) => (key === 'theme.activeId' ? activeId : []));
    configSetMock.mockImplementation(async (_key: string, value: string) => {
      activeId = value;
    });
    configSetLocalMock.mockImplementation((_key: string, value: string) => {
      activeId = value;
    });
    publishMock.mockResolvedValue(undefined);
    applyTheme(BUILTIN_THEMES.find((theme) => theme.id === 'light')!);
    delete (window as BrowserWindow).electronAPI;
  });

  afterEach(() => {
    (window as BrowserWindow).electronAPI = {};
  });

  it('returns the selected theme in WebUI without invoking the Electron relay', async () => {
    const selected = await setActiveTheme('dark');

    expect(selected.appearance).toBe('dark');
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes the selected theme when running inside Electron', async () => {
    (window as BrowserWindow).electronAPI = {};

    const selected = await setActiveTheme('dark');

    expect(publishMock).toHaveBeenCalledWith(selected);
  });

  it('rejects when the preference cannot be saved', async () => {
    configSetMock.mockImplementation(async (_key: string, value: string) => {
      activeId = value;
      throw new Error('save failed');
    });

    await expect(setActiveTheme('dark')).rejects.toThrow('save failed');
    expect(configGetMock('theme.activeId')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-surface')).toBe('solid');
    expect(publishMock).not.toHaveBeenCalled();
  });

  it.each([
    ['light', 'light', 'solid'],
    ['dark', 'dark', 'solid'],
    ['glass', 'light', 'glass'],
  ])('selects %s with its matching appearance and material', async (id, appearance, surface) => {
    await setActiveTheme('glass');
    await setActiveTheme(id);

    expect(document.documentElement.getAttribute('data-theme')).toBe(appearance);
    expect(document.documentElement.getAttribute('data-surface')).toBe(surface);
    expect(configGetMock('theme.activeId')).toBe(id);
  });

  it('keeps a saved selection when the optional Electron relay fails', async () => {
    (window as BrowserWindow).electronAPI = {};
    publishMock.mockRejectedValue(new Error('relay unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(setActiveTheme('glass')).resolves.toMatchObject({ id: 'glass', surface: 'glass' });
      expect(configGetMock('theme.activeId')).toBe('glass');
      expect(document.documentElement.getAttribute('data-surface')).toBe('glass');
    } finally {
      warning.mockRestore();
    }
  });

  it('saves rapid choices in order so the last choice remains active', async () => {
    let releaseFirst!: () => void;
    configSetMock.mockImplementationOnce(async (_key: string, value: string) => {
      activeId = value;
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    });
    const first = setActiveTheme('dark');
    const second = setActiveTheme('glass');
    await vi.waitFor(() => expect(configSetMock).toHaveBeenCalledTimes(1));
    releaseFirst();
    await Promise.all([first, second]);

    expect(configGetMock('theme.activeId')).toBe('glass');
    expect(document.documentElement.getAttribute('data-surface')).toBe('glass');
  });

  it('allows the next choice after an earlier save fails', async () => {
    configSetMock.mockRejectedValueOnce(new Error('save failed'));
    const failed = setActiveTheme('dark');
    const next = setActiveTheme('glass');

    await expect(failed).rejects.toThrow('save failed');
    await expect(next).resolves.toMatchObject({ id: 'glass' });
    expect(document.documentElement.getAttribute('data-surface')).toBe('glass');
  });
});
