import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';
import { getAssistantConnectionIssue, getSelectableProviderModels } from '@/renderer/hooks/agent/connection/readiness';
import { describe, expect, it } from 'vitest';

const provider = (overrides: Partial<IProvider> = {}): IProvider => ({
  id: 'local-provider',
  name: 'Local model server',
  platform: 'custom',
  base_url: 'http://localhost:12345/v1',
  api_key: '',
  models: ['model-alpha'],
  ...overrides,
});

const assistant = (overrides: Partial<AssistantDetail> = {}): AssistantDetail => ({
  id: 'foundry-prd',
  source: 'builtin',
  agent_status: 'online',
  team_selectable: true,
  deletable: false,
  profile: { name: 'PRD assistant', name_i18n: {}, description_i18n: {} },
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
  ...overrides,
});

describe('assistant connection configuration', () => {
  it('requires a key for the official DeepSeek endpoint even when a model was saved', () => {
    const deepseek = provider({
      name: 'DeepSeek',
      base_url: 'https://api.deepseek.com/v1',
      models: ['deepseek-flash'],
      api_key: '  ',
    });
    expect(getAssistantConnectionIssue(assistant(), [deepseek])?.kind).toBe('noApiModel');
    expect(getAssistantConnectionIssue(assistant(), [{ ...deepseek, api_key: 'test-only-not-a-real-key' }])).toBeNull();
  });

  it('uses the localized assistant name and falls back to the profile name', () => {
    const detail = assistant({
      profile: { name: 'PRD assistant', name_i18n: { 'zh-CN': 'PRD 助手' }, description_i18n: {} },
    });
    expect(getAssistantConnectionIssue(detail, [], undefined, 'zh-CN')?.name).toBe('PRD 助手');
    expect(getAssistantConnectionIssue(detail, [], undefined, 'fr-FR')?.name).toBe('PRD assistant');
    Reflect.deleteProperty(detail.profile, 'name_i18n');
    expect(getAssistantConnectionIssue(detail, [], undefined, 'zh-CN')?.name).toBe('PRD assistant');
  });

  it('guides an API assistant to setup before any provider exists', () => {
    expect(getAssistantConnectionIssue(assistant(), [])).toEqual({
      id: 'foundry-prd',
      name: 'PRD assistant',
      kind: 'noApiModel',
    });
  });

  it.each([
    ['empty model list', { models: [] }],
    ['blank model names', { models: ['', '  '] }],
    ['disabled provider', { enabled: false }],
    ['disabled model', { model_enabled: { 'model-alpha': false } }],
    ['embedding-only provider', { models: ['text-embedding-3-small'] }],
    ['image-only provider', { models: ['dall-e-3'] }],
  ] satisfies Array<[string, Partial<IProvider>]>)('blocks an API assistant with %s', (_name, overrides) => {
    expect(getAssistantConnectionIssue(assistant(), [provider(overrides)])?.kind).toBe('noApiModel');
  });

  it('retains unknown conversation models and allows keyless local API configuration', () => {
    expect(getAssistantConnectionIssue(assistant(), [provider()])).toBeNull();
  });

  it.each(['offline', 'missing'] as const)('recovers an API assistant despite stale %s runtime status', (status) => {
    expect(getAssistantConnectionIssue(assistant({ agent_status: status }), [provider()])).toBeNull();
  });

  it('requires the exact selected provider even if another provider has the same model name', () => {
    const stale: TProviderWithModel = { ...provider({ id: 'deleted-provider' }), use_model: 'model-alpha' };
    expect(getAssistantConnectionIssue(assistant(), [provider()], { model: stale })?.kind).toBe('modelUnavailable');
  });

  it('requires an explicitly selected model to remain enabled', () => {
    expect(getAssistantConnectionIssue(assistant(), [provider()], { modelId: 'removed-model' })?.kind).toBe(
      'modelUnavailable'
    );
  });

  it('surfaces a fixed assistant model that is no longer configured', () => {
    const detail = assistant();
    detail.defaults.model = { mode: 'fixed', value: 'removed-model' };
    expect(getAssistantConnectionIssue(detail, [provider()])?.kind).toBe('modelUnavailable');
  });

  it('allows automatic model selection to recover from a stale remembered model', () => {
    const detail = assistant();
    detail.preferences.last_model_id = 'removed-model';
    expect(getAssistantConnectionIssue(detail, [provider()])).toBeNull();
  });

  it('allows a current explicit selection to replace a stale remembered model', () => {
    const detail = assistant();
    detail.preferences.last_model_id = 'removed-model';
    expect(getAssistantConnectionIssue(detail, [provider()], { modelId: 'model-alpha' })).toBeNull();
  });

  it.each(['online', 'unchecked'] as const)('does not require an API provider for a %s native CLI', (status) => {
    const detail = assistant({
      agent_status: status,
      engine: { agent_id: 'codex', agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' } },
    });
    expect(getAssistantConnectionIssue(detail, [])).toBeNull();
  });

  it.each(['offline', 'missing'] as const)('blocks a %s native CLI before starting', (status) => {
    const detail = assistant({
      agent_status: status,
      engine: { agent_id: 'codex', agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' } },
    });
    expect(getAssistantConnectionIssue(detail, [provider()])?.kind).toBe('agentUnavailable');
  });

  it('blocks an assistant whose bound Agent no longer exists', () => {
    expect(getAssistantConnectionIssue(assistant({ engine: { agent_id: 'removed-agent' } }), [provider()])?.kind).toBe(
      'agentUnavailable'
    );
  });
});

describe('selectable provider models', () => {
  it('excludes disabled providers, disabled models and specialized non-chat models', () => {
    const models = getSelectableProviderModels([
      provider({ id: 'disabled', enabled: false }),
      provider({
        models: ['model-alpha', 'model-beta', 'text-embedding-3-small', 'dall-e-3', ''],
        model_enabled: { 'model-beta': false },
      }),
    ]);
    expect(models.map((model) => [model.id, model.use_model])).toEqual([['local-provider', 'model-alpha']]);
  });

  it('returns no selectable model for an empty configuration', () => {
    expect(getSelectableProviderModels([])).toEqual([]);
  });
});
