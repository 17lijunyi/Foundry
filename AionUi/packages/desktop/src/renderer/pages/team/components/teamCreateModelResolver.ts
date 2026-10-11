/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { assistantRuntimeKey, type AssistantDetail } from '@/common/types/agent/assistantTypes';
import { getSelectableProviderModels } from '@renderer/hooks/agent/connection/readiness';

/**
 * Resolve the `model` value a team agent should send to `POST /api/teams`.
 *
 * Backend `service.rs` consumes `input.model` verbatim with no default, so an
 * empty or backend-name-only value (e.g. "gemini") ends up persisted as
 * `use_model: null`. Downstream, GeminiSendBox / AionrsSendBox gate the
 * textarea on `current_model?.useModel` and render disabled. See mnemo #297.
 *
 * This resolver reads assistant-owned defaults first and then falls back to
 * backend-safe defaults when the selected assistant has no explicit model.
 * API-backed assistants require an actual enabled provider model; placeholders
 * are only valid for ACP engines that resolve their own model defaults.
 *
 * For ACP backends (claude, codex, acp) the model is resolved from the
 * agent's handshake data or cached model info so the backend receives a
 * valid model ID (e.g. "claude-sonnet-4-5-20250514") instead of the bare
 * backend name.
 */
export async function resolveDefaultTeamAgentModel(params: {
  assistant_id?: string;
  assistant_backend?: string;
}): Promise<string> {
  const { assistant_id, assistant_backend } = params;

  const assistantDetail = await resolveAssistantDetail(assistant_id);
  const backend = assistantDetail?.engine?.agent
    ? assistantRuntimeKey({ agent: assistantDetail.engine.agent })
    : assistant_backend;

  if (backend === 'aionrs') {
    return resolveAionrsDefaultModel(assistantDetail);
  }

  if (assistantDetail) {
    const assistantModel = resolveAssistantModel(assistantDetail);
    if (assistantModel) {
      return assistantModel;
    }

    return resolveBackendDefaultModel(backend);
  }

  return resolveBackendDefaultModel(backend);
}

async function resolveAssistantDetail(assistant_id?: string): Promise<AssistantDetail | undefined> {
  if (!assistant_id) return undefined;

  try {
    const detail = (await ipcBridge.assistants.get.invoke({ id: assistant_id })) as AssistantDetail | null;
    return detail ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveAssistantModel(detail: AssistantDetail): string | undefined {
  if (detail.defaults.model.mode === 'fixed' && detail.defaults.model.value) {
    return detail.defaults.model.value;
  }

  if (detail.defaults.model.mode === 'auto' && detail.preferences.last_model_id) {
    return detail.preferences.last_model_id;
  }

  return undefined;
}

function resolveBackendDefaultModel(assistant_backend?: string): Promise<string> {
  if (assistant_backend === 'gemini') {
    return resolveGeminiDefaultModel();
  }

  if (assistant_backend === 'aionrs') {
    return resolveAionrsDefaultModel();
  }

  if (assistant_backend === 'antigravity') {
    return resolveAntigravityDefaultModel();
  }

  return resolveAcpDefaultModel(assistant_backend ?? 'acp');
}

async function resolveAcpDefaultModel(_assistant_backend: string): Promise<string> {
  return 'default';
}

async function resolveAntigravityDefaultModel(): Promise<string> {
  // An empty model means "no --model flag": team provisioning persists it
  // verbatim, the session layer filters empty ids to None, and agy runs on
  // its own default model — the exact path direct chat already uses. The
  // 'default' placeholder is not a real agy model id and fails every team
  // turn with UserLlmProviderModelNotFound while agy's discovery is empty.
  return '';
}

async function resolveGeminiDefaultModel(): Promise<string> {
  // The legacy 'gemini.defaultModel' config key has been removed after the
  // Gemini → ACP consolidation. Always fall back to the 'auto' alias.
  return 'auto';
}

async function resolveAionrsDefaultModel(detail?: AssistantDetail): Promise<string> {
  const providers = await ipcBridge.mode.listProviders.invoke();
  const models = getSelectableProviderModels(providers ?? []);
  const preferredModel = detail ? resolveAssistantModel(detail) : undefined;
  const preferred = models.find((model) => model.use_model === preferredModel);

  if (detail?.defaults.model.mode === 'fixed' && !preferred) {
    throw new Error('AIONRS_MODEL_UNAVAILABLE');
  }

  const selected = preferred ?? models[0];
  if (!selected) {
    throw new Error('AIONRS_NO_AVAILABLE_MODEL');
  }

  return selected.use_model;
}
