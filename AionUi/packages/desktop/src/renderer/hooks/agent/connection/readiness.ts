import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { assistantRuntimeKey, type AssistantDetail } from '@/common/types/agent/assistantTypes';
import { hasSpecificModelCapability } from '@/renderer/utils/model/modelCapabilities';

export type ConnectionIssueKind = 'noApiModel' | 'modelUnavailable' | 'agentUnavailable' | 'checkFailed';
export type ConnectionIssue = { id: string; name: string; kind: ConnectionIssueKind };
export type ConnectionRequest = { id: string; model?: TProviderWithModel; modelId?: string };

/** Return enabled models that can be used for an assistant conversation. */
export function getSelectableProviderModels(providers: IProvider[]): TProviderWithModel[] {
  return providers.flatMap((provider) => {
    if (provider.enabled === false) return [];
    // DeepSeek's official endpoint requires a key even when models were entered manually.
    try {
      if (new URL(provider.base_url).hostname === 'api.deepseek.com' && !provider.api_key?.trim()) return [];
    } catch {
      // Other providers may use local or platform-specific endpoint formats.
    }
    return (provider.models ?? [])
      .filter(
        (model) =>
          model.trim() &&
          provider.model_enabled?.[model] !== false &&
          hasSpecificModelCapability(provider, model, 'function_calling') !== false &&
          hasSpecificModelCapability(provider, model, 'excludeFromPrimary') !== true
      )
      .map((model) => ({ ...provider, use_model: model }));
  });
}

/** Check configuration only; an installed CLI or saved API is not a verified login. */
export function getAssistantConnectionIssue(
  detail: AssistantDetail,
  providers: IProvider[],
  selection?: Pick<ConnectionRequest, 'model' | 'modelId'>,
  localeKey?: string
): ConnectionIssue | null {
  const issue = (kind: ConnectionIssueKind): ConnectionIssue => ({
    id: detail.id,
    name: (localeKey && detail.profile.name_i18n?.[localeKey]) || detail.profile.name,
    kind,
  });
  const backend = assistantRuntimeKey({ agent: detail.engine.agent });
  if (
    !detail.engine.agent ||
    (backend !== 'aionrs' && (detail.agent_status === 'missing' || detail.agent_status === 'offline'))
  ) {
    return issue('agentUnavailable');
  }
  if (backend !== 'aionrs') return null;
  const models = getSelectableProviderModels(providers);
  if (models.length === 0) return issue('noApiModel');
  // Auto-mode history is a preference, not a binding. Model selection can fall
  // back to an available model when that history is stale.
  const modelId =
    selection?.model?.use_model ||
    selection?.modelId ||
    (detail.defaults.model.mode === 'fixed' ? detail.defaults.model.value : undefined);
  if (
    modelId &&
    !models.some((model) => model.use_model === modelId && (!selection?.model || model.id === selection.model.id))
  ) {
    return issue('modelUnavailable');
  }
  return null;
}
