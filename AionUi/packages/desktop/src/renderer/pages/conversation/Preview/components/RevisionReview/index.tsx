/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMotion } from '@/renderer/hooks/ui/useMotion';
import { Button, Message } from '@arco-design/web-react';
import { Check, Switch, Undo } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RevisionReview.module.css';

type RevisionReviewProps = {
  original: string;
  draft: string;
  dirty: boolean;
  onAdopt: () => Promise<boolean>;
  onRestoreDraft: (content: string) => void;
};

/** Reviews real editor changes; undo restores an unsaved draft, never writes a file. */
const RevisionReview: React.FC<RevisionReviewProps> = ({ original, draft, dirty, onAdopt, onRestoreDraft }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState<{ original: string; draft: string } | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const detailsRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const { animate } = useMotion();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (expanded && detailsRef.current) {
      animate(detailsRef.current, [
        { opacity: 0.45, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ]);
    }
  }, [expanded, animate]);

  useEffect(() => {
    if (accepted && statusRef.current) {
      animate(statusRef.current, [
        { opacity: 0.4, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ]);
    }
  }, [accepted, animate]);

  const adopt = async (): Promise<void> => {
    if (busyRef.current || !dirty) return;
    busyRef.current = true;
    setSaving(true);
    const snapshot = { original, draft };
    try {
      const saved = await onAdopt();
      if (saved && mountedRef.current) {
        setAccepted(snapshot);
        setExpanded(false);
      }
    } catch {
      if (mountedRef.current) Message.error(t('common.saveFailed'));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  // A later edit or external reload must not be erased by an old undo action.
  const canUndo = Boolean(accepted && !dirty && draft === accepted.draft && original === accepted.draft);
  if (!dirty && !canUndo) return null;

  return (
    <section className={styles.review} aria-label={t('preview.revisionReview.title')}>
      <div className={styles.bar} ref={statusRef}>
        {dirty ? (
          <>
            <span className={styles.hint}>{t('preview.revisionReview.draftHint')}</span>
            <Button
              size='small'
              type='text'
              icon={<Switch size={15} />}
              aria-expanded={expanded}
              disabled={saving}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t('preview.continueEdit') : t('preview.revisionReview.review')}
            </Button>
          </>
        ) : (
          <>
            <span className={styles.saved} role='status'>
              <Check size={15} />
              {t('preview.revisionReview.saved')}
            </span>
            <Button
              size='small'
              type='text'
              icon={<Undo size={15} />}
              title={t('preview.revisionReview.undoHint')}
              onClick={() => {
                if (!accepted || !canUndo) return;
                onRestoreDraft(accepted.original);
                setAccepted(null);
                setExpanded(true);
              }}
            >
              {t('preview.revisionReview.undo')}
            </Button>
          </>
        )}
      </div>
      {expanded && dirty && (
        <div ref={detailsRef} className={styles.details}>
          <div className={styles.columns}>
            <div className={styles.column}>
              <div className={styles.label}>{t('preview.revisionReview.before')}</div>
              <pre>{original || t('preview.revisionReview.empty')}</pre>
            </div>
            <div className={styles.column}>
              <div className={styles.label}>{t('preview.revisionReview.after')}</div>
              <pre>{draft || t('preview.revisionReview.empty')}</pre>
            </div>
          </div>
          <div className={styles.actions}>
            <Button size='small' disabled={saving} onClick={() => setExpanded(false)}>
              {t('preview.continueEdit')}
            </Button>
            <Button size='small' type='primary' loading={saving} onClick={() => void adopt()}>
              {t('preview.revisionReview.adopt')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default RevisionReview;
