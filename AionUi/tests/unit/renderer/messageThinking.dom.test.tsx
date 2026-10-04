/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageThinking } from '@/common/chat/chatLib';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

const animateMock = vi.hoisted(() => vi.fn());
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate: animateMock }) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

function createThinkingMessage(createdAt: number): IMessageThinking {
  return {
    id: 'thinking-1',
    type: 'thinking',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    position: 'left',
    created_at: createdAt,
    content: {
      content: 'analyzing',
      status: 'thinking',
    },
  };
}

describe('MessageThinking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    animateMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves elapsed time when the component remounts for an active thinking message', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const createdAt = Date.now() - 5_000;

    const { unmount } = render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 5s')).toBeInTheDocument();

    unmount();

    vi.setSystemTime(new Date('2026-05-26T09:00:12.000Z'));
    render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 7s')).toBeInTheDocument();
  });

  it('folds a completed thought once and keeps a manually reopened transcript open during later updates', () => {
    const message = createThinkingMessage(Date.now());
    const { rerender } = render(<MessageThinking message={message} />);
    const done: IMessageThinking = { ...message, content: { ...message.content, status: 'done', duration: 2000 } };
    rerender(<MessageThinking message={done} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button'));
    rerender(<MessageThinking message={{ ...done, content: { ...done.content, content: 'final transcript' } }} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(animateMock).toHaveBeenCalledTimes(1);
  });

  it('does not replay completion for a finished thought loaded from history', () => {
    const message = createThinkingMessage(Date.now());
    render(<MessageThinking message={{ ...message, content: { ...message.content, status: 'done' } }} />);
    expect(animateMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});
