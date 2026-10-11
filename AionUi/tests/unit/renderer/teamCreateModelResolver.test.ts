/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';

const getAssistantMock = vi.fn();
const listProvidersMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      get: {
        invoke: (...args: unknown[]) => getAssistantMock(...args),
      },
    },
    mode: { listProviders: { invoke: (...args: unknown[]) => listProvidersMock(...args) } },
  },
}));

import { resolveDefaultTeamAgentModel } from '@/renderer/pages/team/components/teamCreateModelResolver';

describe('resolveDefaultTeamAgentModel', () => {
  beforeEach(() => {
    getAssistantMock.mockReset();
    listProvidersMock.mockReset();
    listProvidersMock.mockResolvedValue([]);
  });

  it('prefers the assistant fixed default model over agent-level fallbacks', async () => {
    getAssistantMock.mockResolvedValue({
      defaults: {
        model: { mode: 'fixed', value: 'claude-sonnet-4-5-20250514' },
      },
      preferences: {
        last_model_id: 'claude-opus-4-1-20250805',
      },
    });

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-fixed',
      })
    ).resolves.toBe('claude-sonnet-4-5-20250514');
  });

  it('uses the assistant remembered auto model before falling back to backend defaults', async () => {
    getAssistantMock.mockResolvedValue({
      defaults: {
        model: { mode: 'auto' },
      },
      preferences: {
        last_model_id: 'gemini-2.5-pro',
      },
    });

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-auto',
      })
    ).resolves.toBe('gemini-2.5-pro');
  });

  it('falls back to the assistant engine backend when no assistant-owned model is stored', async () => {
    getAssistantMock.mockResolvedValue({
      defaults: {
        model: { mode: 'auto' },
      },
      preferences: {
        last_model_id: undefined,
      },
      engine: {
        agent_id: 'cc126dd5',
        agent: {
          id: 'cc126dd5',
          type: 'acp',
          source: 'builtin',
          acp_backend: 'gemini',
        },
      },
    });

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-gemini',
      })
    ).resolves.toBe('auto');
  });

  it('uses the provided assistant backend when detail lookup fails', async () => {
    getAssistantMock.mockRejectedValue(new Error('lookup failed'));

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-gemini',
        assistant_backend: 'gemini',
      })
    ).resolves.toBe('auto');
  });

  it('returns an empty model for antigravity assistants resolved from engine details', async () => {
    getAssistantMock.mockResolvedValue({
      defaults: {
        model: { mode: 'auto' },
      },
      preferences: {
        last_model_id: undefined,
      },
      engine: {
        agent_id: 'agy-agent',
        agent: {
          id: 'agy-agent',
          type: 'acp',
          source: 'builtin',
          acp_backend: 'antigravity',
        },
      },
    });

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-antigravity',
      })
    ).resolves.toBe('');
  });

  it('returns an empty model for the antigravity backend when detail lookup fails', async () => {
    getAssistantMock.mockRejectedValue(new Error('lookup failed'));

    await expect(
      resolveDefaultTeamAgentModel({
        assistant_id: 'assistant-antigravity',
        assistant_backend: 'antigravity',
      })
    ).resolves.toBe('');
  });

  it('selects an actual enabled API model instead of the default placeholder', async () => {
    listProvidersMock.mockResolvedValue([
      provider('disabled-provider', ['gpt-disabled-provider'], { enabled: false }),
      provider('configured', ['dall-e-3', 'gpt-disabled', 'gpt-4.1'], { model_enabled: { 'gpt-disabled': false } }),
    ]);
    await expect(
      resolveDefaultTeamAgentModel({
        assistant_backend: 'aionrs',
      })
    ).resolves.toBe('gpt-4.1');
  });

  it('respects a fixed API model only when it remains enabled and selectable', async () => {
    getAssistantMock.mockResolvedValue(apiAssistant({ mode: 'fixed', value: 'gpt-4.1' }));
    listProvidersMock.mockResolvedValue([provider('configured', ['gpt-4o', 'gpt-4.1'])]);

    await expect(resolveDefaultTeamAgentModel({ assistant_id: 'api-assistant' })).resolves.toBe('gpt-4.1');
  });

  it('rejects a fixed API model that became unavailable instead of silently replacing it', async () => {
    getAssistantMock.mockResolvedValue(apiAssistant({ mode: 'fixed', value: 'gpt-disabled' }));
    listProvidersMock.mockResolvedValue([
      provider('configured', ['gpt-disabled', 'gpt-4.1'], { model_enabled: { 'gpt-disabled': false } }),
    ]);

    await expect(resolveDefaultTeamAgentModel({ assistant_id: 'api-assistant' })).rejects.toThrow(
      'AIONRS_MODEL_UNAVAILABLE'
    );
  });

  it('uses an available remembered API model before the first configured model', async () => {
    getAssistantMock.mockResolvedValue(apiAssistant({ mode: 'auto' }, 'gpt-4.1'));
    listProvidersMock.mockResolvedValue([provider('configured', ['gpt-4o', 'gpt-4.1'])]);

    await expect(resolveDefaultTeamAgentModel({ assistant_id: 'api-assistant' })).resolves.toBe('gpt-4.1');
  });

  it('replaces a stale remembered API model with a currently eligible model', async () => {
    getAssistantMock.mockResolvedValue(apiAssistant({ mode: 'auto' }, 'removed-model'));
    listProvidersMock.mockResolvedValue([provider('configured', ['gpt-4.1'])]);

    await expect(resolveDefaultTeamAgentModel({ assistant_id: 'api-assistant' })).resolves.toBe('gpt-4.1');
  });

  it.each([
    { name: 'no providers', providers: [] },
    { name: 'disabled providers', providers: [provider('off', ['gpt-4.1'], { enabled: false })] },
    { name: 'disabled models', providers: [provider('off', ['gpt-4.1'], { model_enabled: { 'gpt-4.1': false } })] },
    { name: 'non-chat models', providers: [provider('images', ['dall-e-3', 'text-embedding-3-small'])] },
  ])('rejects API model resolution with $name', async ({ providers }) => {
    listProvidersMock.mockResolvedValue(providers);

    await expect(resolveDefaultTeamAgentModel({ assistant_backend: 'aionrs' })).rejects.toThrow(
      'AIONRS_NO_AVAILABLE_MODEL'
    );
  });

  it('permits configured local models that do not require an API key', async () => {
    listProvidersMock.mockResolvedValue([
      provider('local', ['local-chat'], { platform: 'openai', base_url: 'http://localhost:11434/v1', api_key: '' }),
    ]);

    await expect(resolveDefaultTeamAgentModel({ assistant_backend: 'aionrs' })).resolves.toBe('local-chat');
  });

  it('fails without creating a placeholder when provider settings cannot be loaded', async () => {
    listProvidersMock.mockRejectedValue(new Error('Provider settings unavailable'));

    await expect(resolveDefaultTeamAgentModel({ assistant_backend: 'aionrs' })).rejects.toThrow(
      'Provider settings unavailable'
    );
  });

  it('keeps the default placeholder for other ACP backends such as claude', async () => {
    await expect(
      resolveDefaultTeamAgentModel({
        assistant_backend: 'claude',
      })
    ).resolves.toBe('default');
    expect(listProvidersMock).not.toHaveBeenCalled();
  });
});

function provider(id: string, models: string[], overrides?: Partial<IProvider>): IProvider {
  return {
    id,
    name: id,
    platform: 'openai',
    base_url: 'https://provider.example/v1',
    api_key: '',
    models,
    ...overrides,
  };
}

function apiAssistant(model: { mode: string; value?: string }, lastModelId?: string) {
  return {
    engine: { agent: { type: 'aionrs', source: 'internal' } },
    defaults: { model },
    preferences: { last_model_id: lastModelId },
  };
}
