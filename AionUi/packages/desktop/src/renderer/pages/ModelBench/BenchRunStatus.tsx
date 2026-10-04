import React, { useEffect, useRef } from 'react';
import { Tag } from '@arco-design/web-react';
import { Check } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useMotion } from '@/renderer/hooks/ui/useMotion';
import type { BenchResult } from './types';
import styles from './ModelBench.module.css';

/** Each lane completes independently; streaming tokens never restart its motion. */
export const BenchRunStatus = ({ result, now }: { result: BenchResult; now: number }) => {
  const { t } = useTranslation();
  const { animate } = useMotion();
  const statusRef = useRef<HTMLDivElement>(null);
  const previous = useRef(result.status);

  useEffect(() => {
    if ((previous.current === 'running' || previous.current === 'waiting') && result.status === 'done') {
      animate(statusRef.current, [
        { opacity: 0.55, transform: 'perspective(500px) rotateX(-25deg) translateY(4px)' },
        { opacity: 1, transform: 'perspective(500px) rotateX(0deg) translateY(0)' },
      ]);
    }
    previous.current = result.status;
  }, [animate, result.status]);

  const elapsed = result.status === 'running' ? Math.max(0, now - (result.startedAt ?? now)) : result.elapsed;
  return (
    <div className={styles.status} ref={statusRef}>
      <Tag>
        <span className={styles.statusLabel} role='status'>
          {result.status === 'done' ? (
            <Check size={13} strokeWidth={3} aria-hidden='true' />
          ) : result.status === 'running' ? (
            <span className={styles.runningDot} aria-hidden='true' />
          ) : null}
          {t(`common.modelBench.status.${result.status}`)}
        </span>
      </Tag>
      <span>{(elapsed / 1000).toFixed(1)} s</span>
    </div>
  );
};
