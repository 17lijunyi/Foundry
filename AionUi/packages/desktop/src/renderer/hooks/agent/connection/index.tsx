import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import AionModal from '@/renderer/components/base/AionModal';
import { useSettingsModal } from '@/renderer/components/settings/SettingsModal/useSettingsModal';
import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';
import { Button, Message } from '@arco-design/web-react';
import { LinkCloud } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';
import { fetchProviders, PROVIDERS_SWR_KEY } from '../useModelProviderList';
import { getAssistantConnectionIssue, type ConnectionIssue, type ConnectionRequest } from './readiness';

type PendingApiSetup = {
  generation: number;
  requests: ConnectionRequest[];
  resolve: (ready: boolean) => void;
};

/** A shared setup prompt for starting chats and creating teams without discarding drafts. */
export function useAssistantConnection() {
  const { t, i18n } = useTranslation();
  const [issues, setIssues] = useState<ConnectionIssue[]>([]);
  const [checking, setChecking] = useState(false);
  const [apiSetup, setApiSetup] = useState<{ issues: ConnectionIssue[]; generation: number } | null>(null);
  const checkGenerationRef = useRef(0);
  const lastRequestsRef = useRef<ConnectionRequest[]>([]);
  const pendingApiSetupRef = useRef<PendingApiSetup | null>(null);
  const { openSettings, settingsModal, visible: settingsVisible } = useSettingsModal();

  const settleApiSetup = useCallback((ready: boolean) => {
    const pending = pendingApiSetupRef.current;
    pendingApiSetupRef.current = null;
    pending?.resolve(ready);
  }, []);

  const cancelPending = useCallback(() => {
    ++checkGenerationRef.current;
    settleApiSetup(false);
    setApiSetup(null);
    setIssues([]);
    setChecking(false);
  }, [settleApiSetup]);

  useEffect(
    () => () => {
      ++checkGenerationRef.current;
      settleApiSetup(false);
    },
    [settleApiSetup]
  );

  const readIssues = useCallback(
    async (requests: ConnectionRequest[], generation: number): Promise<ConnectionIssue[] | null> => {
      const details = await Promise.all(
        requests.map((request) => ipcBridge.assistants.get.invoke({ id: request.id, locale: i18n.language }))
      );
      const needsApi = details.some(
        (detail) => detail && assistantRuntimeKey({ agent: detail.engine.agent }) === 'aionrs'
      );
      const providers = needsApi ? await fetchProviders() : [];
      if (generation !== checkGenerationRef.current) return null;
      if (needsApi) await mutate(PROVIDERS_SWR_KEY, providers, false);
      if (generation !== checkGenerationRef.current) return null;
      return details.flatMap((detail, index) => {
        if (!detail) return [{ id: requests[index].id, name: '', kind: 'checkFailed' as const }];
        const issue = getAssistantConnectionIssue(detail, providers, requests[index], resolveLocaleKey(i18n.language));
        return issue ? [issue] : [];
      });
    },
    [i18n.language]
  );

  const ensureReady = useCallback(
    async (requests: ConnectionRequest[], options?: { configureApi?: boolean }): Promise<boolean> => {
      const generation = ++checkGenerationRef.current;
      settleApiSetup(false);
      setApiSetup(null);
      const uniqueRequests = [...new Map(requests.map((request) => [request.id, request])).values()];
      lastRequestsRef.current = uniqueRequests;
      setChecking(true);
      try {
        const nextIssues = await readIssues(uniqueRequests, generation);
        if (!nextIssues) return false;
        if (
          options?.configureApi &&
          nextIssues.length > 0 &&
          nextIssues.every((issue) => issue.kind === 'noApiModel')
        ) {
          setIssues([]);
          // Selection stays pending until saving succeeds or the user cancels.
          return new Promise<boolean>((resolve) => {
            pendingApiSetupRef.current = { generation, requests: uniqueRequests, resolve };
            setApiSetup({ issues: nextIssues, generation });
          });
        }
        setIssues(nextIssues);
        return nextIssues.length === 0;
      } catch {
        // Provider payloads can contain credentials. Never log them or raw errors here.
        if (generation === checkGenerationRef.current) {
          setIssues([{ id: uniqueRequests[0]?.id ?? '', name: '', kind: 'checkFailed' }]);
        }
        return false;
      } finally {
        if (generation === checkGenerationRef.current) setChecking(false);
      }
    },
    [readIssues, settleApiSetup]
  );

  const closeApiSetup = useCallback(
    (generation: number) => {
      if (generation !== checkGenerationRef.current) return;
      if (pendingApiSetupRef.current?.generation === generation) {
        ++checkGenerationRef.current;
        settleApiSetup(false);
      }
      setApiSetup(null);
    },
    [settleApiSetup]
  );

  const openSetup = useCallback(
    (tab: 'model' | 'agent') => {
      setIssues([]);
      openSettings(tab);
    },
    [openSettings]
  );
  const hasApiIssue = issues.some((issue) => issue.kind === 'noApiModel' || issue.kind === 'modelUnavailable');
  const hasAgentIssue = issues.some((issue) => issue.kind === 'agentUnavailable');
  const saveApiProvider = useCallback(
    async (provider: IProvider, generation: number) => {
      const pending = pendingApiSetupRef.current;
      if (!pending || pending.generation !== generation) return;
      try {
        await ipcBridge.mode.createProvider.invoke(provider);
      } catch {
        Message.error(t('settings.saveModelConfigFailed'));
        throw new Error('PROVIDER_CONFIG_SAVE_FAILED');
      }
      if (generation !== checkGenerationRef.current) return;
      try {
        // Re-read persisted configuration before allowing the original selection.
        const nextIssues = await readIssues(pending.requests, generation);
        if (!nextIssues) return;
        setIssues(nextIssues);
        setApiSetup(null);
        settleApiSetup(nextIssues.length === 0);
      } catch {
        if (generation !== checkGenerationRef.current) return;
        setIssues([{ id: pending.requests[0]?.id ?? '', name: '', kind: 'checkFailed' }]);
        setApiSetup(null);
        settleApiSetup(false);
      }
    },
    [t, readIssues, settleApiSetup]
  );
  const dialog = (
    <>
      {apiSetup && (
        <AddPlatformModal
          initialPlatformValue='DeepSeek'
          headerTitle={t('agent.connection.setupTitle', {
            names: apiSetup.issues
              .map((issue) => issue.name)
              .filter(Boolean)
              .join(' · '),
          })}
          onSubmit={(provider) => saveApiProvider(provider, apiSetup.generation)}
          modalProps={{
            visible: true,
            className: 'assistant-api-setup-modal',
            wrapStyle: { zIndex: 10020 },
            maskStyle: { zIndex: 10019 },
          }}
          modalCtrl={{ close: () => closeApiSetup(apiSetup.generation) }}
        />
      )}
      <AionModal
        variant='standard'
        visible={issues.length > 0}
        onCancel={() => setIssues([])}
        header={{ title: t('agent.connection.title'), showClose: true }}
        wrapStyle={{ zIndex: 10020 }}
        maskStyle={{ zIndex: 10019 }}
        footer={
          <div className='flex flex-wrap justify-end gap-8px'>
            <Button onClick={() => setIssues([])}>{t('common.cancel')}</Button>
            <Button loading={checking} onClick={() => void ensureReady(lastRequestsRef.current)}>
              {t('common.retry')}
            </Button>
            {hasAgentIssue && <Button onClick={() => openSetup('agent')}>{t('agent.connection.manageAgent')}</Button>}
            {hasApiIssue && (
              <Button type='primary' onClick={() => openSetup('model')} data-testid='connection-configure-api'>
                {t('agent.connection.configureApi')}
              </Button>
            )}
          </div>
        }
      >
        <div className='flex flex-col gap-12px' data-testid='assistant-connection-dialog'>
          {issues.map((issue) => (
            <div key={issue.id} className='rounded-12px bg-fill-1 p-12px'>
              {issue.name && <div className='mb-4px font-600 text-t-primary'>{issue.name}</div>}
              <p className='m-0 text-13px leading-22px text-t-secondary'>{t(`agent.connection.${issue.kind}`)}</p>
            </div>
          ))}
          <p className='m-0 text-12px leading-20px text-t-tertiary'>{t('agent.connection.sharedHint')}</p>
          <p className='m-0 text-12px leading-20px text-t-tertiary'>{t('agent.connection.resumeHint')}</p>
        </div>
      </AionModal>
      {settingsVisible ? settingsModal : null}
    </>
  );
  return { ensureReady, cancelPending, dialog, settingsVisible: settingsVisible || apiSetup !== null, openSetup };
}

/** Persistent inline guidance, shown before the user tries an unconfigured assistant. */
export function AssistantConnectionNotice({
  issue,
  onConfigure,
}: {
  issue: ConnectionIssue | null;
  onConfigure: () => void;
}) {
  const { t } = useTranslation();
  if (!issue) return null;
  return (
    <div className='flex flex-wrap items-center gap-10px rounded-16px bg-fill-1 px-16px py-12px' role='status'>
      <LinkCloud size={18} fill='currentColor' className='shrink-0 text-t-secondary' />
      <span className='flex-1 text-13px leading-20px text-t-secondary'>{t(`agent.connection.${issue.kind}`)}</span>
      <Button type='text' size='small' onClick={onConfigure} data-testid='assistant-connection-setup'>
        {t(issue.kind === 'agentUnavailable' ? 'agent.connection.manageAgent' : 'agent.connection.configureApi')}
      </Button>
    </div>
  );
}
