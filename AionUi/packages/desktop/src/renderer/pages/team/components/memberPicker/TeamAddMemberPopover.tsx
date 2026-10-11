import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';
import { useTeamAssistantOptions } from '../../hooks/useTeamAssistantOptions';
import { useTeamTabs } from '../../hooks/TeamTabsContext';
import type { TeamAssistantOption } from '../assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from '../teamCreateModelResolver';
import TeamAssistantPickerDropdown from './TeamAssistantPickerDropdown';
import { useAssistantConnection } from '@/renderer/hooks/agent/connection';

const useAcpDraft = getSendBoxDraftHook('acp', { _type: 'acp', atPath: [], content: '', uploadFile: [] });
const useAionrsDraft = getSendBoxDraftHook('aionrs', { _type: 'aionrs', atPath: [], content: '', uploadFile: [] });

type Props = {
  children: React.ReactElement;
  disabled?: boolean;
};

const TeamAddMemberPopover: React.FC<Props> = ({ children, disabled = false }) => {
  const { t, i18n } = useTranslation();
  const { ensureReady, cancelPending, dialog: connectionDialog } = useAssistantConnection();
  const { assistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const { addAssistant, switchTab, team_id, assistants: teamMembers = [] } = useTeamTabs();
  const [visible, setVisible] = useState(false);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | undefined>();
  const pendingSelectionRef = useRef(false);
  const selectionGenerationRef = useRef(0);

  // Leader 会话草稿：用于「告诉 Leader」预填提示词。Hook 必须无条件调用，
  // 未知 Leader 会话时传空串（不写入）。按 Leader 后端选 acp/aionrs 草稿。
  const leader = teamMembers.find((m) => m.role === 'leader');
  const leaderConversationId = leader?.conversation_id ?? '';
  const acpDraft = useAcpDraft(leaderConversationId);
  const aionrsDraft = useAionrsDraft(leaderConversationId);

  useEffect(() => {
    pendingSelectionRef.current = false;
    setPendingAssistantId(undefined);
    setVisible(false);
    if (disabled) cancelPending();
    return () => {
      ++selectionGenerationRef.current;
      pendingSelectionRef.current = false;
      cancelPending();
    };
  }, [disabled, team_id, cancelPending]);

  const handleTellLeader = useCallback(() => {
    if (!leader?.slot_id || !leaderConversationId) return;
    switchTab(leader.slot_id);
    const text = t('team.addMember.tellLeaderPrefill', {
      defaultValue: 'Help me add a member good at ___ to the team',
    });
    if (leader.assistant_backend === 'aionrs') {
      aionrsDraft.mutate((prev) => ({ ...prev, content: text }));
    } else {
      acpDraft.mutate((prev) => ({ ...prev, content: text }));
    }
    setVisible(false);
  }, [leader?.slot_id, leader?.assistant_backend, leaderConversationId, switchTab, t, acpDraft, aionrsDraft]);

  const handleSelect = async (assistant: TeamAssistantOption) => {
    if (disabled || !addAssistant || pendingSelectionRef.current) return;
    const generation = ++selectionGenerationRef.current;
    pendingSelectionRef.current = true;
    setPendingAssistantId(assistant.id);
    try {
      const ready = await ensureReady([{ id: assistant.id }], { configureApi: true });
      if (generation !== selectionGenerationRef.current) return;
      if (!ready) {
        setVisible(false);
        return;
      }
      const model = await resolveDefaultTeamAgentModel({
        assistant_id: assistant.id,
        assistant_backend: assistant.backend,
      });
      if (generation !== selectionGenerationRef.current) return;
      const input: TeamAssistantInput = {
        role: 'teammate',
        assistant_name: assistant.name,
        assistant_id: assistant.id,
        model,
      };
      const created: TeamAssistant = await addAssistant(input);
      if (generation !== selectionGenerationRef.current) return;
      setVisible(false);
      switchTab(created.slot_id);
    } catch (error) {
      if (generation === selectionGenerationRef.current) {
        Message.error(getConversationCreateErrorMessage(error, t));
      }
    } finally {
      if (generation === selectionGenerationRef.current) {
        pendingSelectionRef.current = false;
        setPendingAssistantId(undefined);
      }
    }
  };

  return (
    <>
      <TeamAssistantPickerDropdown
        assistants={assistants}
        onSelect={handleSelect}
        visible={visible}
        onVisibleChange={setVisible}
        disabled={disabled || !addAssistant}
        pendingAssistantId={pendingAssistantId}
        testIdPrefix='team-add-member'
        panelTestId='team-add-member-panel'
        title={t('team.addMember.title', { defaultValue: 'Add member' })}
        subtitle={t('team.addMember.subtitle', { defaultValue: 'The same assistant can be added repeatedly' })}
        guidanceFooter={
          leader?.slot_id ? (
            <div className='text-12px leading-18px text-t-tertiary'>
              {t('team.addMember.tellLeaderHint', {
                defaultValue: 'Not a good fit? You can also ask the Leader to arrange it.',
              })}{' '}
              <span
                data-testid='team-add-member-tell-leader'
                className='text-[color:var(--brand)] font-500 cursor-pointer hover:underline'
                onClick={handleTellLeader}
              >
                {t('team.addMember.tellLeaderCta', { defaultValue: 'Tell the Leader →' })}
              </span>
            </div>
          ) : undefined
        }
      >
        {children}
      </TeamAssistantPickerDropdown>
      {connectionDialog}
    </>
  );
};

export default TeamAddMemberPopover;
