/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { addRecentWorkspace } from '@/renderer/components/workspace';
import { Button, Tooltip } from '@arco-design/web-react';
import { Close, FolderOpen } from '@icon-park/react';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

type GuidWorkspaceFootnoteProps = {
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
};

const GuidWorkspaceFootnote: React.FC<GuidWorkspaceFootnoteProps> = ({
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
}) => {
  const { t } = useTranslation();
  const dialogPending = useRef(false);

  const handleBrowseWorkspace = useCallback(async () => {
    if (dialogPending.current) return;
    dialogPending.current = true;

    try {
      const dirs = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory', 'createDirectory'],
        ...(workspaceDir ? { defaultPath: workspaceDir } : {}),
      });
      if (dirs?.[0]) {
        addRecentWorkspace(dirs[0]);
        onSelectWorkspace(dirs[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    } finally {
      dialogPending.current = false;
    }
  }, [onSelectWorkspace, workspaceDir]);

  const workspaceName = workspaceDir ? workspaceDir.split(/[\\/]/).pop() || workspaceDir : '';

  return (
    <div className={styles.workspaceFootnote}>
      {workspaceDir ? (
        <Tooltip content={workspaceDir} position='top'>
          <div className={styles.workspacePill}>
            <Button
              type='text'
              data-testid='workspace-selector-btn'
              className={`${styles.workspacePillMain} !h-auto`}
              onClick={() => void handleBrowseWorkspace()}
            >
              <span className='flex min-w-0 items-center gap-5px'>
                <FolderOpen theme='outline' size='14' fill='currentColor' className='shrink-0' />
                <span className={styles.workspacePillName}>{workspaceName}</span>
              </span>
            </Button>
            <Button
              type='text'
              aria-label={t('guid.workspace.clearWorkspace')}
              className={`${styles.workspacePillClose} !h-18px !w-18px !p-0`}
              onClick={onClearWorkspace}
              icon={<Close theme='outline' size='10' fill='currentColor' />}
            />
          </div>
        </Tooltip>
      ) : (
        <Button
          type='text'
          className={`${styles.workspaceEmptyBtn} !h-auto`}
          data-testid='workspace-selector-btn'
          onClick={() => void handleBrowseWorkspace()}
        >
          <span className='flex items-center gap-5px'>
            <FolderOpen theme='outline' size='14' fill='currentColor' className='shrink-0' />
            <span>{t('guid.workspace.workInProject')}</span>
          </span>
        </Button>
      )}
    </div>
  );
};

export default GuidWorkspaceFootnote;
