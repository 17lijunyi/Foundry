import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';

const state = vi.hoisted(() => ({ providers: [] as IProvider[] }));
vi.mock('@/renderer/hooks/agent/useGoogleAuthModels', () => ({
  useGoogleAuthModels: () => ({ isGoogleAuth: false }),
}));
vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: state.providers }),
}));

import { useGuidModelSelection } from '@/renderer/pages/guid/hooks/useGuidModelSelection';

const provider = (overrides: Partial<IProvider> = {}): IProvider => ({
  id: 'local-api',
  name: 'Local API',
  platform: 'custom',
  base_url: 'http://localhost:11434/v1',
  api_key: '',
  models: ['model-a', 'model-b'],
  ...overrides,
});

describe('Guid model selection after connection changes', () => {
  beforeEach(() => {
    state.providers = [];
  });

  it('uses a real enabled model after API configuration and excludes disabled providers and models', async () => {
    state.providers = [provider({ id: 'disabled', enabled: false }), provider({ model_enabled: { 'model-a': false } })];
    const { result } = renderHook(() => useGuidModelSelection());
    await waitFor(() => expect(result.current.current_model?.use_model).toBe('model-b'));
    expect(result.current.modelList.map((item) => item.id)).toEqual(['local-api']);
  });

  it('clears the selected model when all providers are removed', async () => {
    state.providers = [provider()];
    const { result, rerender } = renderHook(() => useGuidModelSelection());
    await waitFor(() => expect(result.current.current_model?.use_model).toBe('model-a'));
    state.providers = [];
    act(() => rerender());
    await waitFor(() => expect(result.current.current_model).toBeUndefined());
  });

  it('replaces a selected model after it is disabled instead of retaining a stale selection', async () => {
    state.providers = [provider()];
    const { result, rerender } = renderHook(() => useGuidModelSelection());
    await waitFor(() => expect(result.current.current_model?.use_model).toBe('model-a'));
    state.providers = [provider({ model_enabled: { 'model-a': false } })];
    act(() => rerender());
    await waitFor(() => expect(result.current.current_model?.use_model).toBe('model-b'));
  });

  it('refreshes connection credentials without resetting the selected provider and model', async () => {
    state.providers = [provider({ api_key: 'old-test-key' })];
    const { result, rerender } = renderHook(() => useGuidModelSelection());
    await act(async () => {
      await result.current.setCurrentModel({ ...state.providers[0], use_model: 'model-b' });
    });
    state.providers = [provider({ api_key: 'new-test-key', base_url: 'http://localhost:12345/v1' })];
    act(() => rerender());
    await waitFor(() =>
      expect(result.current.current_model).toMatchObject({
        api_key: 'new-test-key',
        base_url: 'http://localhost:12345/v1',
        use_model: 'model-b',
      })
    );
  });
});
