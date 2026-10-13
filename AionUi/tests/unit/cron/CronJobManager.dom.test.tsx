/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const { navigate, getJob, onRemoved } = vi.hoisted(() => ({
  navigate: vi.fn(),
  getJob: vi.fn(),
  onRemoved: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@/renderer/pages/cron/useCronJobs', () => ({ useCronJobs: () => ({ jobs: [], loading: false }) }));
vi.mock('@arco-design/web-react', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      getJob: { invoke: getJob },
      onJobCreated: { on: vi.fn(() => vi.fn()) },
      onJobUpdated: { on: vi.fn(() => vi.fn()) },
      onJobRemoved: { on: onRemoved },
    },
  },
}));

import CronJobManager from '@/renderer/pages/cron/components/CronJobManager';

const job = (id: string) => ({ id, enabled: true, name: id, state: { last_status: 'success' } }) as ICronJob;

describe('CronJobManager request isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJob.mockReset();
    onRemoved.mockReturnValue(vi.fn());
  });

  it('opens the current task after an older conversation response arrives', async () => {
    let resolvePrevious!: (value: ICronJob) => void;
    getJob
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePrevious = resolve;
        })
      )
      .mockResolvedValueOnce(job('task-2'));
    const { rerender } = render(<CronJobManager conversation_id='conv-1' cron_job_id='task-1' />);
    rerender(<CronJobManager conversation_id='conv-2' cron_job_id='task-2' />);
    await screen.findByTestId('cron-job-manager');

    await act(async () => {
      resolvePrevious(job('task-1'));
    });
    fireEvent.click(screen.getByRole('button'));

    expect(navigate).toHaveBeenCalledWith('/scheduled/task-2');
  });

  it('keeps the current task visible when an older conversation request fails', async () => {
    let rejectPrevious!: (error: Error) => void;
    getJob
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectPrevious = reject;
        })
      )
      .mockResolvedValueOnce(job('task-2'));
    const { rerender } = render(<CronJobManager conversation_id='conv-1' cron_job_id='task-1' />);
    rerender(<CronJobManager conversation_id='conv-2' cron_job_id='task-2' />);
    await screen.findByTestId('cron-job-manager');

    await act(async () => {
      rejectPrevious(new Error('old request failed'));
    });

    expect(screen.getByTestId('cron-job-manager')).toBeInTheDocument();
  });

  it('hides the old task while the new conversation task is loading', async () => {
    getJob.mockResolvedValueOnce(job('task-1')).mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(<CronJobManager conversation_id='conv-1' cron_job_id='task-1' />);
    await screen.findByTestId('cron-job-manager');

    rerender(<CronJobManager conversation_id='conv-2' cron_job_id='task-2' />);

    expect(screen.queryByTestId('cron-job-manager')).not.toBeInTheDocument();
  });

  it('does not restore a removed task when its initial lookup finishes', async () => {
    let resolveLookup!: (value: ICronJob) => void;
    getJob.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLookup = resolve;
      })
    );
    render(<CronJobManager conversation_id='conv-1' cron_job_id='task-1' />);
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));

    await act(async () => {
      onRemoved.mock.calls[0][0]({ job_id: 'task-1' });
      resolveLookup(job('task-1'));
    });

    expect(screen.queryByTestId('cron-job-manager')).not.toBeInTheDocument();
  });
});
