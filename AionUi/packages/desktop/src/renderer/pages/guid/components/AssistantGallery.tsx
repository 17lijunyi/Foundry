import type { Assistant } from '@/common/types/agent/assistantTypes';
import { replaceUpstreamBrand } from '@/common/branding';
import { Button, Empty, Input } from '@arco-design/web-react';
import { Check, Down, Robot, Search, Up } from '@icon-park/react';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMotion } from '@/renderer/hooks/ui/useMotion';
import { useTranslation } from 'react-i18next';
import { useAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { managedAgentSearchText } from '@/renderer/utils/model/agentTypes';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';
import { assistantMatchesSearch } from './AssistantSelectionArea';
import styles from '../index.module.css';

type AssistantGalleryProps = {
  selectedAssistantId?: string | null;
  assistants: Assistant[];
  localeKey: string;
  onSelectAssistant: (id: string) => void;
};

/** A searchable gallery of real assistants; selection still feeds the existing composer. */
const AssistantGallery: React.FC<AssistantGalleryProps> = ({
  selectedAssistantId,
  assistants,
  localeKey,
  onSelectAssistant,
}) => {
  const { t } = useTranslation();
  const { assistantOrder } = useAssistantOrder();
  const runtimeCatalog = useManagedAgentRuntimeCatalog();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const galleryRef = useRef<HTMLElement>(null);
  const requestedSelectionRef = useRef<string | null>(null);
  const { animate } = useMotion();
  useLayoutEffect(() => {
    if (!selectedAssistantId || requestedSelectionRef.current !== selectedAssistantId) return;
    requestedSelectionRef.current = null;
    const card = Array.from(galleryRef.current?.querySelectorAll<HTMLElement>('[data-assistant-id]') ?? []).find(
      (element) => element.dataset.assistantId === selectedAssistantId
    );
    animate(card?.querySelector(`.${styles.galleryArtwork}`), [
      { transform: 'scale(.88)' },
      { offset: 0.65, transform: 'scale(1.06)' },
      { transform: 'scale(1)' },
    ]);
    animate(card?.querySelector(`.${styles.gallerySelected}`), [
      { opacity: 0, transform: 'scale(.7)' },
      { opacity: 1, transform: 'scale(1)' },
    ]);
  }, [selectedAssistantId, animate]);
  const available = useMemo(() => selectableAssistants(assistants, assistantOrder), [assistants, assistantOrder]);
  const runtimeSearch = useMemo(
    () => new Map(runtimeCatalog.map((agent) => [agent.id, managedAgentSearchText(agent, localeKey)])),
    [runtimeCatalog, localeKey]
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? available.filter(
          (assistant) =>
            assistantMatchesSearch(assistant, localeKey, query, runtimeSearch.get(assistant.agent_id)) ||
            replaceUpstreamBrand(assistant.name_i18n?.[localeKey] || assistant.name)
              .toLowerCase()
              .includes(query)
        )
      : available;
  }, [available, search, localeKey, runtimeSearch]);
  const selectedIndex = filtered.findIndex((assistant) => assistant.id === selectedAssistantId);
  const visible =
    search || expanded
      ? filtered
      : selectedIndex >= 8
        ? [...filtered.slice(0, 7), filtered[selectedIndex]]
        : filtered.slice(0, 8);

  return (
    <section ref={galleryRef} className={styles.gallery} aria-label={t('settings.assistants')}>
      <div className={styles.galleryHeader}>
        <h2 className={styles.galleryTitle}>{t('guid.glass.chooseAssistant')}</h2>
        <Input
          className={styles.gallerySearch}
          prefix={<Search size={15} strokeWidth={2.5} />}
          placeholder={t('guid.glass.searchAssistants')}
          aria-label={t('guid.glass.searchAssistants')}
          value={search}
          onChange={setSearch}
          allowClear
        />
      </div>
      <div className={styles.galleryGrid}>
        {visible.map((assistant) => {
          const avatar = resolveAssistantAvatar(assistant.avatar);
          const name = replaceUpstreamBrand(assistant.name_i18n?.[localeKey] || assistant.name);
          const selected = selectedAssistantId === assistant.id;
          return (
            <Button
              key={assistant.id}
              type='text'
              className={styles.galleryCard}
              aria-label={name}
              aria-pressed={selected}
              data-assistant-id={assistant.id}
              onClick={() => {
                requestedSelectionRef.current = selected ? null : assistant.id;
                onSelectAssistant(assistant.id);
              }}
            >
              <span className={styles.galleryArtwork} aria-hidden='true'>
                {avatar.kind === 'image' ? (
                  <ThemedLogo src={avatar.value} alt='' className={styles.galleryLogo} />
                ) : avatar.kind === 'emoji' ? (
                  <span className={styles.galleryEmoji}>{avatar.value}</span>
                ) : (
                  <Robot className={styles.galleryFallback} size='100%' strokeWidth={2} />
                )}
              </span>
              <span className={styles.galleryCaption}>
                <span className={styles.galleryName}>{name}</span>
                {selected && (
                  <span className={styles.gallerySelected}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
            </Button>
          );
        })}
      </div>
      {filtered.length === 0 && <Empty className={styles.galleryEmpty} description={t('guid.glass.noAssistants')} />}
      {!search && available.length > 8 && (
        <Button
          type='text'
          size='small'
          className={styles.galleryMore}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          icon={expanded ? <Up size={13} /> : <Down size={13} />}
        >
          {expanded ? t('common.collapse') : t('common.more')}
        </Button>
      )}
    </section>
  );
};

export default AssistantGallery;
