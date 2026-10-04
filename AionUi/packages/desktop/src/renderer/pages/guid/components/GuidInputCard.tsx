/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import FilePreview from '@/renderer/components/media/FilePreview';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { Input } from '@arco-design/web-react';
import type { RefTextAreaType } from '@arco-design/web-react/es/Input';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useMotion } from '@/renderer/hooks/ui/useMotion';
import styles from '../index.module.css';
import GuidWorkspaceFootnote from './GuidWorkspaceFootnote';

export type PromptTransfer = {
  sequence: number;
  text: string;
  source: { left: number; top: number; width: number; height: number };
};

type GuidInputCardProps = {
  assistantName?: string;
  assistantMotionKey?: string;
  promptTransfer?: PromptTransfer;
  focusRequestKey?: string;
  // Input state
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPaste: React.ClipboardEventHandler;
  onFocus: () => void;
  onBlur: () => void;
  placeholder: string;

  // Styling
  isInputActive: boolean;
  isFileDragging: boolean;
  activeBorderColor: string;
  inactiveBorderColor: string;
  activeShadow: string;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;

  // Files
  files: string[];
  onRemoveFile: (path: string) => void;

  // Action row
  actionRow: React.ReactNode;
  slashCommandMenu?: React.ReactNode;

  // Workspace
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
};

const GuidInputCard: React.FC<GuidInputCardProps> = ({
  assistantName,
  assistantMotionKey,
  promptTransfer,
  focusRequestKey,
  input,
  onInputChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  placeholder,
  isInputActive,
  isFileDragging,
  activeBorderColor,
  inactiveBorderColor,
  activeShadow,
  dragHandlers,
  files,
  onRemoveFile,
  actionRow,
  slashCommandMenu,
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { compositionHandlers, isComposing } = useCompositionInput();
  const inputRef = useRef<RefTextAreaType | null>(null);
  const assistantRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLSpanElement>(null);
  const consumedTransferRef = useRef<number | null>(null);
  const { animate } = useMotion();
  const textareaAutoSize = isMobile ? { minRows: 2, maxRows: 8 } : { minRows: 2, maxRows: 20 };

  useLayoutEffect(() => {
    if (!assistantMotionKey) return;
    animate(assistantRef.current, [
      { opacity: 0.35, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ]);
  }, [assistantMotionKey, animate]);

  useLayoutEffect(() => {
    if (!promptTransfer || promptTransfer.sequence === consumedTransferRef.current || input !== promptTransfer.text)
      return;
    consumedTransferRef.current = promptTransfer.sequence;
    const textarea = inputRef.current?.dom;
    const transfer = transferRef.current;
    if (!textarea || !transfer) return;
    textarea.focus();
    textarea.setSelectionRange(input.length, input.length);
    const source = promptTransfer.source;
    const target = textarea.getBoundingClientRect();
    const origin = transfer.parentElement?.getBoundingClientRect();
    if (!origin) return;
    if (source.width > 0 && source.height > 0 && target.width > 0 && target.height > 0) {
      animate(
        transfer,
        [
          { opacity: 0.85, transform: `translate(${source.left - origin.left}px, ${source.top - origin.top}px)` },
          {
            opacity: 0,
            transform: `translate(${target.left - origin.left}px, ${target.top - origin.top}px) scale(${target.width / source.width}, ${target.height / source.height})`,
          },
        ],
        { duration: 380 }
      );
    }
    animate(textarea, [{ opacity: 0.45 }, { opacity: 1 }], { duration: 280 });
  }, [promptTransfer, input, animate]);

  useEffect(() => {
    if (!focusRequestKey || isMobile) return;
    inputRef.current?.focus();
    inputRef.current?.dom.setSelectionRange(input.length, input.length);
  }, [focusRequestKey, input, isMobile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isComposing.current) return;
    onKeyDown(e);
  };

  const borderColor = isFileDragging
    ? 'rgb(var(--primary-3))'
    : isInputActive
      ? activeBorderColor
      : inactiveBorderColor;

  return (
    <div className={styles.guidInputCardWrap}>
      <div
        className={`guid-input-card-shell relative rd-24px flex flex-col ${slashCommandMenu ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 ${isFileDragging ? 'b b-solid border-dashed guid-input-card-shell--dragging' : ''}`}
        style={{
          zIndex: 1,
          transition: 'box-shadow 0.25s ease',
          ...(isFileDragging
            ? {
                backgroundColor: 'var(--color-primary-light-1)',
                borderColor: 'rgb(var(--primary-3))',
                borderWidth: '1px',
              }
            : {
                boxShadow: isInputActive ? activeShadow : 'none',
              }),
        }}
        {...dragHandlers}
      >
        <div
          className={`${styles.guidInputInner} relative p-16px flex flex-col bg-dialog-fill-0`}
          style={{
            transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
            borderColor: isFileDragging ? 'rgb(var(--primary-3))' : borderColor,
            boxShadow: isInputActive && !isFileDragging ? activeShadow : 'none',
          }}
        >
          {assistantName && (
            <div ref={assistantRef} className={styles.composerAssistant}>
              {assistantName}
            </div>
          )}
          <Input.TextArea
            ref={inputRef}
            autoSize={textareaAutoSize}
            placeholder={placeholder}
            spellCheck={false}
            className={`text-14px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !py-0 !pe-0 !ps-7px ${styles.lightPlaceholder}`}
            value={input}
            onChange={onInputChange}
            onPaste={onPaste}
            onFocus={onFocus}
            onBlur={onBlur}
            {...compositionHandlers}
            onKeyDown={handleKeyDown}
            data-testid='guid-input'
          />
          <div style={{ height: 12, flexShrink: 0 }} aria-hidden='true' />
          {files.length > 0 && (
            <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px'>
              {files.map((path) => (
                <FilePreview key={path} path={path} onRemove={() => onRemoveFile(path)} />
              ))}
            </div>
          )}
          <UploadProgressBar source='sendbox' />
          {actionRow}
          {slashCommandMenu && (
            <div className='absolute start-0 end-0 top-[calc(100%+4px)] z-70'>{slashCommandMenu}</div>
          )}
        </div>
      </div>
      <GuidWorkspaceFootnote
        workspaceDir={workspaceDir}
        onSelectWorkspace={onSelectWorkspace}
        onClearWorkspace={onClearWorkspace}
      />
      {promptTransfer && (
        <span
          ref={transferRef}
          className={styles.promptTransfer}
          aria-hidden='true'
          style={{ width: promptTransfer.source.width, height: promptTransfer.source.height }}
        >
          {promptTransfer.text}
        </span>
      )}
    </div>
  );
};

export default GuidInputCard;
