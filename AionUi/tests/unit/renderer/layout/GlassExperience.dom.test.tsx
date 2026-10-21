import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantGallery from '@/renderer/pages/guid/components/AssistantGallery';
import GlassNavigation from '@/renderer/components/layout/Titlebar/GlassNavigation';
import CssThemeSettings from '@/renderer/pages/settings/AppearanceSettings/CssThemeSettings';
import { Message } from '@arco-design/web-react';

const state = vi.hoisted(() => ({
  pathname: '/model-bench',
  theme: 'light',
  activeId: 'glass',
  selectTheme: vi.fn(),
  configGet: vi.fn(),
  configSet: vi.fn(),
  extensionThemes: vi.fn(),
  order: [] as string[],
  navigate: vi.fn(),
  animate: vi.fn(),
}));
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate: state.animate, cancel: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: state.pathname }),
  useNavigate: () => state.navigate,
}));
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    theme: state.theme,
    activeId: state.activeId,
    activeTheme: null,
    selectTheme: state.selectTheme,
  }),
}));
vi.mock('@/common/config/configService', () => ({ configService: { get: state.configGet, set: state.configSet } }));
vi.mock('@/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common')>();
  return {
    ...actual,
    ipcBridge: {
      ...actual.ipcBridge,
      extensions: { ...actual.ipcBridge.extensions, getThemes: { invoke: state.extensionThemes } },
    },
  };
});
vi.mock('@/renderer/pages/settings/AppearanceSettings/CssThemeModal.tsx', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/assistant/useAssistantOrder', () => ({
  useAssistantOrder: () => ({ assistantOrder: state.order }),
}));
vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({ useManagedAgentRuntimeCatalog: () => [] }));

const assistant = (index: number, extra: Partial<Assistant> = {}): Assistant => ({
  id: `assistant-${index}`,
  source: 'user',
  name: `Assistant ${index}`,
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: index,
  agent_id: `runtime-${index}`,
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
  agent_status: 'online',
  team_selectable: true,
  deletable: true,
  ...extra,
});

beforeEach(() => {
  state.order = [];
  state.pathname = '/model-bench';
  state.theme = 'light';
  state.activeId = 'glass';
  vi.clearAllMocks();
  state.selectTheme.mockResolvedValue(undefined);
  state.configGet.mockReturnValue([]);
  state.extensionThemes.mockResolvedValue([]);
  vi.spyOn(Message, 'success').mockImplementation(() => ({ close: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Glass assistant gallery', () => {
  it('animates only a user selection that becomes the selected assistant', () => {
    const assistants = [assistant(1), assistant(2)];
    const props = { assistants, localeKey: 'en-US', onSelectAssistant: vi.fn() };
    const { rerender } = render(<AssistantGallery {...props} selectedAssistantId='assistant-1' />);
    expect(state.animate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Assistant 2' }));
    expect(state.animate).not.toHaveBeenCalled();
    rerender(<AssistantGallery {...props} selectedAssistantId='assistant-2' />);
    expect(state.animate).toHaveBeenCalledTimes(2);
  });

  it('does not replay motion when restored selection or unrelated gallery data changes', () => {
    const props = { assistants: [assistant(1), assistant(2)], localeKey: 'en-US', onSelectAssistant: vi.fn() };
    const { rerender } = render(<AssistantGallery {...props} selectedAssistantId='assistant-1' />);
    rerender(<AssistantGallery {...props} selectedAssistantId='assistant-2' />);
    fireEvent.change(screen.getByRole('textbox', { name: 'guid.glass.searchAssistants' }), {
      target: { value: 'Assistant' },
    });
    expect(state.animate).not.toHaveBeenCalled();
  });

  it('finds the built-in assistant by the product name displayed to the user', () => {
    render(
      <AssistantGallery
        assistants={[assistant(1, { name: 'AionUi Butler' })]}
        localeKey='zh-CN'
        onSelectAssistant={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'guid.glass.searchAssistants' }), {
      target: { value: '产品' },
    });
    expect(screen.getByRole('button', { name: '产品经理助手' })).toBeInTheDocument();
  });

  it('keeps the selected assistant visible when collapsed and honors saved order and disabled state', () => {
    const assistants = Array.from({ length: 11 }, (_, index) => assistant(index));
    assistants[0].enabled = false;
    state.order = ['assistant-5', 'assistant-3'];
    render(
      <AssistantGallery
        assistants={assistants}
        selectedAssistantId='assistant-10'
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Assistant 0' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: false })[0]).toHaveAccessibleName('Assistant 5');
    expect(screen.getByRole('button', { name: 'Assistant 10' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Assistant 9' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    expect(screen.getByRole('button', { name: 'Assistant 9' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.collapse' }));
    expect(screen.getByRole('button', { name: 'Assistant 10' })).toBeInTheDocument();
  });

  it('searches localized descriptions, selects the real assistant ID, and recovers from no results', () => {
    const select = vi.fn();
    const assistants = [
      assistant(1),
      assistant(2, { name_i18n: { 'zh-CN': '产品助手' }, description_i18n: { 'zh-CN': '市场研究' } }),
    ];
    render(<AssistantGallery assistants={assistants} localeKey='zh-CN' onSelectAssistant={select} />);
    const search = screen.getByRole('textbox', { name: 'guid.glass.searchAssistants' });
    fireEvent.change(search, { target: { value: '  市场  ' } });
    expect(screen.queryByRole('button', { name: 'Assistant 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '产品助手' }));
    expect(select).toHaveBeenCalledWith('assistant-2');
    fireEvent.change(search, { target: { value: 'missing-assistant' } });
    expect(screen.getByText('guid.glass.noAssistants')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Assistant 1' })).toBeInTheDocument();
  });
});

describe('Glass navigation', () => {
  it('navigates through existing routes and resets the assistant from the new conversation shortcut', () => {
    render(<GlassNavigation />);
    const rail = within(screen.getByRole('navigation', { name: 'guid.glass.navigation' }));
    expect(rail.getByRole('button', { name: 'common.modelBench.title' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(rail.getByRole('button', { name: 'common.settings' }));
    expect(state.navigate).toHaveBeenCalledWith('/settings');
    const dock = within(screen.getByRole('navigation', { name: 'guid.glass.quickActions' }));
    fireEvent.click(dock.getByRole('button', { name: 'conversation.welcome.newConversation' }));
    expect(state.navigate).toHaveBeenCalledWith('/guid', { state: { resetAssistant: true } });
  });

  it('reflects nested settings routes and the currently selected glass appearance', async () => {
    state.pathname = '/settings/appearance';
    render(<GlassNavigation />);
    expect(screen.getByRole('button', { name: 'common.settings' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'settings.backgroundAppearance.label' }));
    expect(await screen.findByRole('menuitemradio', { name: 'settings.backgroundAppearance.glass' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
  });

  it.each([
    ['white', 'light'],
    ['black', 'dark'],
    ['glass', 'glass'],
  ])('selects the %s appearance from the rail', async (label, id) => {
    render(<GlassNavigation />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.backgroundAppearance.label' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: `settings.backgroundAppearance.${label}` }));
    await waitFor(() => expect(state.selectTheme).toHaveBeenCalledWith(id));
  });

  it('supports selecting an appearance with the keyboard', async () => {
    render(<GlassNavigation />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.backgroundAppearance.label' }));
    const black = await screen.findByRole('menuitemradio', { name: 'settings.backgroundAppearance.black' });
    black.focus();
    fireEvent.keyDown(black, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(state.selectTheme).toHaveBeenCalledWith('dark'));
  });

  it('reports a failed appearance save without losing the selected value', async () => {
    state.selectTheme.mockRejectedValueOnce(new Error('save failed'));
    const error = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    render(<GlassNavigation />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.backgroundAppearance.label' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'settings.backgroundAppearance.black' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('settings.cssTheme.applyFailed'));
    expect(state.activeId).toBe('glass');
    error.mockRestore();
  });
});

describe('Background appearance settings', () => {
  it('shows three localized default cards with distinct previews and a separate system option', async () => {
    render(<CssThemeSettings />);
    const white = await screen.findByRole('button', { name: 'settings.backgroundAppearance.white' });
    const black = screen.getByRole('button', { name: 'settings.backgroundAppearance.black' });
    expect(white.style.backgroundColor).not.toBe(black.style.backgroundColor);
    expect(screen.getByRole('button', { name: 'settings.backgroundAppearance.glass' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByTestId('theme-card-system')).not.toBeInTheDocument();
  });

  it.each([
    ['white', 'light'],
    ['black', 'dark'],
    ['glass', 'glass'],
  ])('applies the %s card using its persistent theme id', async (label, id) => {
    const success = vi.spyOn(Message, 'success').mockImplementation(() => ({ close: vi.fn() }));
    render(<CssThemeSettings />);
    fireEvent.click(await screen.findByRole('button', { name: `settings.backgroundAppearance.${label}` }));
    await waitFor(() => expect(state.selectTheme).toHaveBeenCalledWith(id));
    success.mockRestore();
  });

  it('preserves the separate follow-system choice', async () => {
    state.activeId = 'system';
    render(<CssThemeSettings />);
    const system = screen.getByRole('button', { name: 'settings.cssTheme.followSystem' });
    expect(system).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(system);
    await waitFor(() => expect(state.selectTheme).toHaveBeenCalledWith('system'));
  });

  it('keeps custom themes editable alongside the default choices', async () => {
    state.configGet.mockReturnValue([
      { id: 'custom', name: 'My theme', appearance: 'dark', builtin: false, created_at: 0, updated_at: 0 },
    ]);
    render(<CssThemeSettings />);
    const custom = await screen.findByRole('button', { name: 'My theme' });
    fireEvent.focus(custom);
    expect(screen.getByRole('button', { name: 'common.edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.cssTheme.addManually' })).toBeInTheDocument();
  });

  it('shows a save failure and keeps the old card selected', async () => {
    state.selectTheme.mockRejectedValueOnce(new Error('save failed'));
    const error = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    render(<CssThemeSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'settings.backgroundAppearance.black' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('settings.cssTheme.applyFailed'));
    expect(screen.getByRole('button', { name: 'settings.backgroundAppearance.glass' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    error.mockRestore();
  });
});
