/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { useGoogleAuthModels } from '@/renderer/hooks/agent/useGoogleAuthModels';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { getSelectableProviderModels } from '@/renderer/hooks/agent/connection/readiness';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Build a unique key for a provider/model pair.
 */
const buildModelKey = (providerId?: string, modelName?: string) => {
  if (!providerId || !modelName) return null;
  return `${providerId}:${modelName}`;
};

/**
 * Check if a model key still exists in the provider list.
 */
const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
  if (!key || !providers || providers.length === 0) return false;
  return providers.some((provider) => {
    if (!provider.id || !provider.models?.length) return false;
    return provider.models.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

/** Provider-based agent keys that share the model list UI */
type ProviderAgentKey = 'aionrs';

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  current_model: TProviderWithModel | undefined;
  setCurrentModel: (model_info: TProviderWithModel, options?: { persistPreference?: boolean }) => Promise<void>;
  resetCurrentModel: (options?: { persistPreference?: boolean }) => Promise<void>;
};

/**
 * Hook that manages the provider-backed model selection state for the Guid page.
 * Assistant-driven defaults are applied by the caller; this hook only owns the
 * transient in-page selection.
 * @param agentKey - current provider-based agent (currently only 'aionrs')
 */
export const useGuidModelSelection = (agentKey: ProviderAgentKey = 'aionrs'): GuidModelSelectionResult => {
  const { isGoogleAuth } = useGoogleAuthModels();
  const { data: modelConfig } = useProvidersQuery();

  const modelList = useMemo(() => {
    return (modelConfig || [])
      .filter((provider) => provider.enabled !== false)
      .map((provider) => ({
        ...provider,
        models: getSelectableProviderModels([provider]).map((model) => model.use_model),
      }))
      .filter((provider) => provider.models.length > 0);
  }, [modelConfig]);

  const formatGeminiModelLabel = useCallback((_provider: { platform?: string } | undefined, modelName?: string) => {
    if (!modelName) return '';
    return modelName;
  }, []);

  const [current_model, _setCurrentModel] = useState<TProviderWithModel>();
  const selectedModelKeyRef = useRef<string | null>(null);

  const setCurrentModel = useCallback(
    async (model_info: TProviderWithModel, _options?: { persistPreference?: boolean }) => {
      selectedModelKeyRef.current = buildModelKey(model_info.id, model_info.use_model);
      _setCurrentModel(model_info);
    },
    []
  );

  const resetCurrentModel = useCallback(
    async (options?: { persistPreference?: boolean }) => {
      if (!modelList || modelList.length === 0) {
        selectedModelKeyRef.current = null;
        _setCurrentModel(undefined);
        return;
      }

      selectedModelKeyRef.current = null;

      const defaultModel = modelList[0];
      const resolvedUseModel = defaultModel?.models[0] ?? '';

      if (!defaultModel || !resolvedUseModel) return;

      await setCurrentModel(
        {
          ...defaultModel,
          use_model: resolvedUseModel,
        },
        options
      );
    },
    [modelList, setCurrentModel]
  );

  // Set default model when modelList or agent changes
  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        selectedModelKeyRef.current = null;
        _setCurrentModel(undefined);
        return;
      }
      const currentKey = selectedModelKeyRef.current || buildModelKey(current_model?.id, current_model?.use_model);
      if (isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        // Keep the selected pair, but use the current credentials and model settings.
        const provider = modelList.find((item) =>
          item.models.some((model) => buildModelKey(item.id, model) === currentKey)
        );
        const model = provider?.models.find((name) => buildModelKey(provider.id, name) === currentKey);
        if (provider && model) _setCurrentModel({ ...provider, use_model: model });
        return;
      }
      await resetCurrentModel();
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [agentKey, current_model?.id, current_model?.use_model, modelList, resetCurrentModel]);
  return {
    modelList,
    isGoogleAuth,
    formatGeminiModelLabel,
    current_model,
    setCurrentModel,
    resetCurrentModel,
  };
};
