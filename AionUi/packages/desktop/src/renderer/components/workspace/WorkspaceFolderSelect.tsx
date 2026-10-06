/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button } from '@arco-design/web-react';
import { Close, FolderOpen } from '@icon-park/react';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_RECENT_WS_KEY, addRecentWorkspace } from './recentWorkspaces';

type WorkspaceFolderSelectProps = {
  value?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder: string;
  recentLabel: string;
  chooseDifferentLabel: string;
  recentStorageKey?: string;
  triggerTestId?: string;
  menuTestId?: string;
  menuZIndex?: number;
};

const WorkspaceFolderSelect: React.FC<WorkspaceFolderSelectProps> = ({
  value,
  onChange,
  onClear,
  placeholder,
  chooseDifferentLabel,
  recentStorageKey = DEFAULT_RECENT_WS_KEY,
  triggerTestId,
}) => {
  const { t } = useTranslation();
  const dialogPending = useRef(false);

  const handleBrowse = async () => {
    if (dialogPending.current) return;
    dialogPending.current = true;

    try {
      const files = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory', 'createDirectory'],
        ...(value ? { defaultPath: value } : {}),
      });
      if (files?.[0]) {
        addRecentWorkspace(files[0], recentStorageKey);
        onChange(files[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    } finally {
      dialogPending.current = false;
    }
  };

  const folderName = value ? value.split(/[\\/]/).pop() || value : '';

  return (
    <div className='flex items-center rounded-10px border border-border-2 bg-fill-1 transition-all hover:border-border-1 hover:bg-fill-2'>
      <Button
        type='text'
        data-testid={triggerTestId}
        aria-label={value ? chooseDifferentLabel : placeholder}
        title={value}
        onClick={() => void handleBrowse()}
        className='!h-auto !min-w-0 !flex-1 !rounded-10px !px-12px !py-10px !text-left'
      >
        <span className='flex min-w-0 items-center gap-10px'>
          <FolderOpen theme='outline' size='16' fill='currentColor' className='block shrink-0 text-t-secondary' />
          <span
            className={`min-w-0 flex-1 truncate text-sm leading-20px ${value ? 'text-t-primary' : 'text-t-secondary'}`}
          >
            {folderName || placeholder}
          </span>
        </span>
      </Button>
      {value && (
        <Button
          type='text'
          aria-label={t('common.clear')}
          onClick={() => {
            if (onClear) onClear();
            else onChange('');
          }}
          className='!mr-8px !h-20px !w-20px !shrink-0 !p-0 !text-t-secondary hover:!text-t-primary'
          icon={<Close theme='outline' size='14' fill='currentColor' />}
        />
      )}
    </div>
  );
};

export default WorkspaceFolderSelect;
