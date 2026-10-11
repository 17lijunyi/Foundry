/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Message } from '@arco-design/web-react';
import { ArrowLeft, Connection } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import LocalAgents from '@/renderer/pages/settings/AgentSettings/LocalAgents';
import AgentRepairPanel from '@/renderer/pages/settings/AgentSettings/AgentRepairPanel';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import { formatManagedAgentDiagnosticMessage } from '@/renderer/utils/model/agentTypes';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

const AgentModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const { agents, isLoading, isRefreshing, refreshCatalog } = useManagedAgents();
  const [repairAgentId, setRepairAgentId] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const repairAgent = agents.find((agent) => agent.id === repairAgentId);

  useEffect(() => {
    if (repairAgentId && !repairAgent && !isLoading && !isRefreshing) setRepairAgentId(null);
  }, [repairAgentId, repairAgent, isLoading, isRefreshing]);

  const handleSaved = useCallback(() => {
    void refreshCatalog().catch(() => Message.error(t('settings.agentManagement.testConnectionError')));
  }, [refreshCatalog, t]);

  const handleTestConnection = useCallback(async () => {
    if (!repairAgent || isTesting) return;
    setIsTesting(true);
    try {
      const result = await ipcBridge.acpConversation.checkManagedAgentHealthById.invoke({ id: repairAgent.id });
      await refreshCatalog();
      if (result.status === 'online') {
        Message.success(t('settings.agentManagement.testConnectionOnline', { name: result.name }));
      } else if (result.status === 'missing') {
        Message.warning(t('settings.agentManagement.testConnectionMissing', { name: result.name }));
      } else if (result.status === 'offline') {
        Message.warning(
          formatManagedAgentDiagnosticMessage(t, result) ||
            (result.last_check_error_code === 'auth_required'
              ? t('settings.agentManagement.testConnectionAuth', { name: result.name })
              : t('settings.agentManagement.testConnectionOffline', { name: result.name }))
        );
      }
    } catch {
      Message.error(t('settings.agentManagement.testConnectionError'));
    } finally {
      setIsTesting(false);
    }
  }, [repairAgent, isTesting, refreshCatalog, t]);

  return (
    <div className='flex flex-col h-full w-full'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        {!isPageMode && repairAgent ? (
          <div data-testid='agent-modal-repair' className='flex flex-col gap-12px'>
            <div className='flex items-center gap-10px'>
              <Button
                type='text'
                icon={<ArrowLeft size={16} />}
                onClick={() => setRepairAgentId(null)}
                data-testid='btn-back-agent-modal-repair'
              >
                {t('common.goBack')}
              </Button>
              <span className='min-w-0 flex-1 truncate text-14px font-600 text-t-primary'>{repairAgent.name}</span>
              <Button
                type='outline'
                size='small'
                icon={<Connection theme='outline' size='14' />}
                loading={isTesting}
                onClick={() => void handleTestConnection()}
                data-testid='btn-test-connection-agent-modal-repair'
              >
                {t('settings.agentManagement.testConnection')}
              </Button>
            </div>
            <AgentRepairPanel key={repairAgent.id} agent={repairAgent} onSaved={handleSaved} />
          </div>
        ) : (
          <LocalAgents onRepair={isPageMode ? undefined : setRepairAgentId} />
        )}
      </AionScrollArea>
    </div>
  );
};

export default AgentModalContent;
