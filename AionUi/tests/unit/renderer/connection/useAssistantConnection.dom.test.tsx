import type { IProvider } from '@/common/config/storage';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';
import { Button, Input } from '@arco-design/web-react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mocks = vi.hoisted(() => ({
  getAssistant: vi.fn(),
  listProviders: vi.fn(),
  createProvider: vi.fn(),
  fetchModels: vi.fn(),
  resetProtocol: vi.fn(),
  showError: vi.fn(),
  mutate: vi.fn(),
  openSettings: vi.fn(),
  createConversation: vi.fn(),
  createTeam: vi.fn(),
  selectAssistant: vi.fn(),
  checkProviderHealth: vi.fn(),
  checkManagedAgentHealth: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: { get: { invoke: mocks.getAssistant } },
    mode: { listProviders: { invoke: mocks.listProviders }, createProvider: { invoke: mocks.createProvider } },
    conversation: { create: { invoke: mocks.createConversation } },
    team: { create: { invoke: mocks.createTeam } },
    acpConversation: {
      checkProviderHealth: { invoke: mocks.checkProviderHealth },
      checkManagedAgentHealthById: { invoke: mocks.checkManagedAgentHealth },
    },
  },
}));
vi.mock('swr', () => ({ mutate: mocks.mutate }));
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return { ...actual, Message: { ...actual.Message, error: mocks.showError } };
});
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } }),
}));
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ fontScale: 1 }) }));
vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  PROVIDERS_SWR_KEY: 'providers',
  fetchProviders: async () => (await mocks.listProviders()) ?? [],
}));
vi.mock('@/renderer/hooks/agent/useModeModeList', () => ({
  default: () => ({ data: { models: [] }, mutate: mocks.fetchModels, isLoading: false, error: undefined }),
}));
vi.mock('@/renderer/hooks/system/useProtocolDetection', () => ({
  default: () => ({ isDetecting: false, result: null, reset: mocks.resetProtocol }),
}));
// Keep actual readiness, prompt rendering and Arco controls. Only replace the
// large settings surface with an in-place, stateful opening/closing boundary.
vi.mock('@/renderer/components/settings/SettingsModal/useSettingsModal', () => ({
  useSettingsModal: () => {
    const [visible, setVisible] = useState(false);
    const [tab, setTab] = useState('model');
    return {
      visible,
      openSettings: (nextTab: string) => {
        mocks.openSettings(nextTab);
        setTab(nextTab);
        setVisible(true);
      },
      settingsModal: visible ? (
        <section aria-label={`Settings ${tab}`} role='dialog'>
          <Button onClick={() => setVisible(false)}>Close settings</Button>
        </section>
      ) : null,
    };
  },
}));

import { AssistantConnectionNotice, useAssistantConnection } from '@/renderer/hooks/agent/connection';
import type { ConnectionRequest } from '@/renderer/hooks/agent/connection/readiness';

const provider = (): IProvider => ({
  id: 'local-provider',
  name: 'Local model server',
  platform: 'custom',
  base_url: 'http://localhost:12345/v1',
  api_key: '',
  models: ['model-alpha'],
});

const assistant = (id = 'foundry-prd'): AssistantDetail => ({
  id,
  source: 'builtin',
  agent_status: 'online',
  team_selectable: true,
  deletable: false,
  profile: { name: id, name_i18n: {}, description_i18n: {} },
  state: { enabled: true, sort_order: 0 },
  engine: { agent_id: 'aionrs', agent: { type: 'aionrs', source: 'internal' } },
  rules: { content: '', storage_mode: 'builtin' },
  prompts: { recommended: [], recommended_i18n: {} },
  defaults: {
    model: { mode: 'auto' },
    permission: { mode: 'auto' },
    thought_level: { mode: 'auto' },
    skills: { mode: 'auto', value: [] },
    mcps: { mode: 'auto', value: [] },
  },
  capabilities: { default_skill_ids: [], custom_skill_names: [], default_disabled_builtin_skill_ids: [] },
  preferences: { last_skill_ids: [], last_disabled_builtin_skill_ids: [], last_mcp_ids: [] },
});

const requests: ConnectionRequest[] = [{ id: 'foundry-prd' }];

function StartHarness() {
  const connection = useAssistantConnection();
  const [draft, setDraft] = useState('Keep my PRD iteration draft');
  const start = async () => {
    if (await connection.ensureReady(requests)) mocks.createConversation({ draft });
  };
  const select = async () => {
    if (await connection.ensureReady(requests, { configureApi: true })) mocks.selectAssistant(requests[0].id);
  };
  return (
    <>
      <Input aria-label='Draft' value={draft} onChange={setDraft} />
      <div>Attached: requirements.md</div>
      <div>Workspace: saved-product</div>
      <Button onClick={() => void start()}>Start</Button>
      <Button onClick={() => void select()}>Select assistant</Button>
      {connection.dialog}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAssistant.mockImplementation(async ({ id }: { id: string }) => assistant(id));
  mocks.listProviders.mockResolvedValue([]);
  mocks.mutate.mockResolvedValue(undefined);
  mocks.createProvider.mockImplementation(async (saved: IProvider) => {
    mocks.listProviders.mockResolvedValue([saved]);
  });
});

afterEach(cleanup);

describe('assistant connection gate', () => {
  it('opens a DeepSeek API form on selection before a conversation can start', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    expect(await screen.findByRole('heading', { name: 'agent.connection.setupTitle' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://api.deepseek.com/v1')).toBeInTheDocument();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.selectAssistant).not.toHaveBeenCalled();
  });

  it.each(['', '  '])('does not save a DeepSeek provider while the API key is blank (%j)', async (key) => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: key } });
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(document.querySelector('.arco-form-item-error')).toBeInTheDocument());
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.selectAssistant).not.toHaveBeenCalled();
  });

  it('saves the user key and DeepSeek Chat Completions model without starting a runtime', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'test-only-not-a-real-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() =>
      expect(mocks.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'DeepSeek',
          platform: 'custom',
          base_url: 'https://api.deepseek.com/v1',
          api_key: 'test-only-not-a-real-key',
          models: ['deepseek-flash'],
          model_settings: { 'deepseek-flash': { openai_api_mode: 'chat_completions' } },
        })
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'agent.connection.setupTitle' })).not.toBeInTheDocument()
    );
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.selectAssistant).toHaveBeenCalledExactlyOnceWith('foundry-prd');
  });

  it('keeps the configuration form and key available when saving fails', async () => {
    mocks.createProvider.mockRejectedValue(new Error('Do not display a credential payload'));
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'test-only-not-a-real-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith('settings.saveModelConfigFailed'));
    expect(screen.getByRole('heading', { name: 'agent.connection.setupTitle' })).toBeInTheDocument();
    expect(screen.queryByText('Do not display a credential payload')).not.toBeInTheDocument();
    expect(mocks.selectAssistant).not.toHaveBeenCalled();
  });

  it('saves only one provider when confirmation is clicked again during validation', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'test-only-not-a-real-key' },
    });
    const confirm = screen.getByRole('button', { name: 'common.confirm' });
    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(mocks.createProvider).toHaveBeenCalledTimes(1);
    expect(mocks.selectAssistant).toHaveBeenCalledExactlyOnceWith('foundry-prd');
  });

  it('allows another save after a failed persistence attempt', async () => {
    mocks.createProvider.mockRejectedValueOnce(new Error('Temporary failure'));
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'test-only-not-a-real-key' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    });
    expect(mocks.selectAssistant).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(mocks.selectAssistant).toHaveBeenCalledExactlyOnceWith('foundry-prd'));
    expect(mocks.createProvider).toHaveBeenCalledTimes(2);
  });

  it.each(['cancel', 'close', 'escape'] as const)(
    'cancels the pending selection and keeps the draft and files via %s',
    async (action) => {
      render(<StartHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
      await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
      if (action === 'escape') {
        fireEvent.keyDown(document.querySelector('input[type="password"]')!, { key: 'Escape', code: 'Escape' });
      } else {
        fireEvent.click(
          action === 'cancel'
            ? screen.getByRole('button', { name: 'common.cancel' })
            : document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
        );
      }
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'agent.connection.setupTitle' })).not.toBeInTheDocument()
      );
      expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep my PRD iteration draft');
      expect(screen.getByText('Attached: requirements.md')).toBeInTheDocument();
      expect(mocks.createProvider).not.toHaveBeenCalled();
      expect(mocks.selectAssistant).not.toHaveBeenCalled();
    }
  );

  it('settles a pending API selection as cancelled when the owning surface unmounts', async () => {
    const { result, unmount } = renderHook(() => useAssistantConnection());
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.ensureReady(requests, { configureApi: true });
    });
    expect(result.current.settingsVisible).toBe(true);
    unmount();
    expect(await pending).toBe(false);
  });

  it('cancels a previous API selection when a new readiness request supersedes it', async () => {
    const { result } = renderHook(() => useAssistantConnection());
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.ensureReady(requests, { configureApi: true });
    });
    mocks.listProviders.mockResolvedValue([provider()]);
    await act(async () => {
      expect(await result.current.ensureReady([{ id: 'different-role' }])).toBe(true);
    });
    expect(await pending).toBe(false);
    expect(result.current.settingsVisible).toBe(false);
  });

  it('does not select an assistant if persisted configuration cannot be verified after saving', async () => {
    mocks.createProvider.mockImplementation(async () => {
      mocks.listProviders.mockRejectedValue(new Error('Private credential payload'));
    });
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));
    await screen.findByRole('heading', { name: 'agent.connection.setupTitle' });
    fireEvent.change(document.querySelector('#api_key_input')!, { target: { value: 'test-only-not-a-real-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    expect(await screen.findByTestId('assistant-connection-dialog')).toHaveTextContent('agent.connection.checkFailed');
    expect(mocks.selectAssistant).not.toHaveBeenCalled();
    expect(screen.queryByText('Private credential payload')).not.toBeInTheDocument();
  });

  it('does not reopen API setup from a stale check after the user selects a ready native CLI', async () => {
    let resolveSlow: ((detail: AssistantDetail) => void) | undefined;
    const native = assistant('native');
    native.engine = { agent_id: 'codex', agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' } };
    mocks.getAssistant.mockImplementation(({ id }: { id: string }) =>
      id === 'slow'
        ? new Promise<AssistantDetail>((resolve) => {
            resolveSlow = resolve;
          })
        : Promise.resolve(native)
    );
    const { result } = renderHook(() => useAssistantConnection());
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.ensureReady([{ id: 'slow' }], { configureApi: true });
    });
    await act(async () => {
      expect(await result.current.ensureReady([{ id: 'native' }], { configureApi: true })).toBe(true);
    });
    await act(async () => {
      resolveSlow?.(assistant('slow'));
      await pending;
    });
    expect(result.current.settingsVisible).toBe(false);
    expect(mocks.createProvider).not.toHaveBeenCalled();
  });

  it('blocks startup and shows setup when an API model is absent', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByTestId('assistant-connection-dialog')).toHaveTextContent('agent.connection.noApiModel');
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.createTeam).not.toHaveBeenCalled();
  });

  it('fails closed when saved provider configuration cannot be read', async () => {
    mocks.listProviders.mockRejectedValue(new Error('Private provider payload must not reach UI'));
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByTestId('assistant-connection-dialog')).toHaveTextContent('agent.connection.checkFailed');
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(screen.queryByText('Private provider payload must not reach UI')).not.toBeInTheDocument();
  });

  it('fails closed when an assistant definition can no longer be read', async () => {
    mocks.getAssistant.mockRejectedValue(new Error('Disconnected'));
    const { result } = renderHook(() => useAssistantConnection());
    let ready = true;
    await act(async () => {
      ready = await result.current.ensureReady(requests);
    });
    expect(ready).toBe(false);
    expect(mocks.listProviders).not.toHaveBeenCalled();
  });

  it('fails closed for a missing assistant detail', async () => {
    mocks.getAssistant.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAssistantConnection());
    let ready = true;
    await act(async () => {
      ready = await result.current.ensureReady(requests);
    });
    expect(ready).toBe(false);
    expect(mocks.listProviders).not.toHaveBeenCalled();
  });

  it('reads one fresh provider configuration for three product roles and deduplicates repeated members', async () => {
    mocks.listProviders.mockResolvedValue([provider()]);
    const { result } = renderHook(() => useAssistantConnection());
    await act(async () => {
      expect(
        await result.current.ensureReady([
          { id: 'aionui-assistant' },
          { id: 'foundry-prd' },
          { id: 'foundry-development' },
          { id: 'foundry-prd' },
        ])
      ).toBe(true);
    });
    expect(mocks.getAssistant.mock.calls.map(([request]) => request.id)).toEqual([
      'aionui-assistant',
      'foundry-prd',
      'foundry-development',
    ]);
    expect(mocks.listProviders).toHaveBeenCalledTimes(1);
  });

  it('publishes the fresh provider configuration to the shared model selector cache', async () => {
    const providers = [provider()];
    mocks.listProviders.mockResolvedValue(providers);
    const { result } = renderHook(() => useAssistantConnection());
    await act(async () => {
      await result.current.ensureReady(requests);
    });
    expect(mocks.mutate).toHaveBeenCalledWith('providers', providers, false);
  });

  it('allows a native CLI without fetching or requiring an API provider', async () => {
    const detail = assistant();
    detail.agent_status = 'unchecked';
    detail.engine = { agent_id: 'codex', agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' } };
    mocks.getAssistant.mockResolvedValue(detail);
    const { result } = renderHook(() => useAssistantConnection());
    await act(async () => {
      expect(await result.current.ensureReady(requests)).toBe(true);
    });
    expect(mocks.listProviders).not.toHaveBeenCalled();
  });

  it('allows choosing an automatic-model assistant after its remembered model is removed', async () => {
    const detail = assistant();
    detail.preferences.last_model_id = 'removed-model';
    mocks.getAssistant.mockResolvedValue(detail);
    mocks.listProviders.mockResolvedValue([provider()]);
    render(<StartHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Select assistant' }));

    await waitFor(() => expect(mocks.selectAssistant).toHaveBeenCalledExactlyOnceWith('foundry-prd'));
    expect(screen.queryByRole('heading', { name: 'agent.connection.setupTitle' })).not.toBeInTheDocument();
    expect(mocks.createProvider).not.toHaveBeenCalled();
  });
});

describe('in-place connection setup and resume', () => {
  it('opens API settings without navigation, model requests or Agent probes', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByTestId('connection-configure-api'));
    expect(screen.getByRole('dialog', { name: 'Settings model' })).toBeInTheDocument();
    expect(mocks.openSettings).toHaveBeenCalledWith('model');
    expect(
      [mocks.navigate, mocks.checkProviderHealth, mocks.checkManagedAgentHealth].every(
        (mock) => !mock.mock.calls.length
      )
    ).toBe(true);
  });

  it('retains the draft, attachments and workspace while settings open and close', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByTestId('connection-configure-api'));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep my PRD iteration draft');
    expect(screen.getByText('Attached: requirements.md')).toBeInTheDocument();
    expect(screen.getByText('Workspace: saved-product')).toBeInTheDocument();
  });

  it('starts on the next click using newly saved configuration and stays silent on subsequent starts', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByTestId('connection-configure-api'));
    mocks.listProviders.mockResolvedValue([provider()]);
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mocks.createConversation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(mocks.createConversation).toHaveBeenCalledTimes(2));
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });

  it('routes unavailable native Agent guidance to Agent settings', async () => {
    const detail = assistant();
    detail.agent_status = 'missing';
    detail.engine = { agent_id: 'codex', agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' } };
    mocks.getAssistant.mockResolvedValue(detail);
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'agent.connection.manageAgent' }));
    expect(screen.getByRole('dialog', { name: 'Settings agent' })).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('allows cancellation without starting a conversation', async () => {
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'common.cancel' }));
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.openSettings).not.toHaveBeenCalled();
  });

  it('rechecks failed configuration on retry without automatically sending the saved draft', async () => {
    mocks.listProviders.mockRejectedValueOnce(new Error('Temporary disconnect')).mockResolvedValue([provider()]);
    render(<StartHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(screen.getByTestId('assistant-connection-dialog')).not.toBeVisible());
    expect(mocks.listProviders).toHaveBeenCalledTimes(2);
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'close', 'escape'] as const)(
    'keeps the connection prompt closed when a retry finishes after %s',
    async (action) => {
      let finishRetry: ((providers: IProvider[]) => void) | undefined;
      mocks.listProviders.mockResolvedValueOnce([]).mockReturnValueOnce(
        new Promise<IProvider[]>((resolve) => {
          finishRetry = resolve;
        })
      );
      render(<StartHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      fireEvent.click(await screen.findByRole('button', { name: 'common.retry' }));
      await waitFor(() => expect(mocks.listProviders).toHaveBeenCalledTimes(2));

      if (action === 'escape') {
        fireEvent.keyDown(screen.getByRole('button', { name: 'common.cancel' }), { key: 'Escape', code: 'Escape' });
      } else {
        fireEvent.click(
          action === 'cancel'
            ? screen.getByRole('button', { name: 'common.cancel' })
            : document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
        );
      }
      await waitFor(() => expect(screen.getByTestId('assistant-connection-dialog')).not.toBeVisible());

      await act(async () => {
        finishRetry?.([]);
      });

      expect(screen.getByTestId('assistant-connection-dialog')).not.toBeVisible();
      expect(mocks.createConversation).not.toHaveBeenCalled();
    }
  );

  it('shows inline guidance only while a connection issue exists', () => {
    const onConfigure = vi.fn();
    const view = render(
      <AssistantConnectionNotice
        issue={{ id: 'foundry-prd', name: 'PRD', kind: 'noApiModel' }}
        onConfigure={onConfigure}
      />
    );
    fireEvent.click(screen.getByTestId('assistant-connection-setup'));
    expect(onConfigure).toHaveBeenCalledTimes(1);
    view.rerender(<AssistantConnectionNotice issue={null} onConfigure={onConfigure} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
