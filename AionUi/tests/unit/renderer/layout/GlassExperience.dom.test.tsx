import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantGallery from '@/renderer/pages/guid/components/AssistantGallery';
import GlassNavigation from '@/renderer/components/layout/Titlebar/GlassNavigation';

const state = vi.hoisted(() => ({
  pathname: '/model-bench',
  theme: 'light',
  order: [] as string[],
  navigate: vi.fn(),
  setTheme: vi.fn(),
  animate: vi.fn(),
}));
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate: state.animate, cancel: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: state.pathname }),
  useNavigate: () => state.navigate,
}));
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: state.theme, setTheme: state.setTheme }),
}));
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
  vi.clearAllMocks();
});
afterEach(cleanup);

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

  it('reflects nested settings routes and switches both theme directions', () => {
    state.pathname = '/settings/appearance';
    const { rerender } = render(<GlassNavigation />);
    expect(screen.getByRole('button', { name: 'common.settings' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'settings.darkMode' }));
    expect(state.setTheme).toHaveBeenLastCalledWith('dark');
    state.theme = 'dark';
    rerender(<GlassNavigation />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.lightMode' }));
    expect(state.setTheme).toHaveBeenLastCalledWith('light');
  });
});
