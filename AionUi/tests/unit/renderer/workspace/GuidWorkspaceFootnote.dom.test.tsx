/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showOpenMock } = vi.hoisted(() => ({ showOpenMock: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: { dialog: { showOpen: { invoke: showOpenMock } } },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import GuidWorkspaceFootnote from '@/renderer/pages/guid/components/GuidWorkspaceFootnote';
import { DEFAULT_RECENT_WS_KEY } from '@/renderer/components/workspace/recentWorkspaces';

const StatefulFootnote = ({ initialValue = '' }: { initialValue?: string }) => {
  const [workspaceDir, setWorkspaceDir] = useState(initialValue);
  return (
    <GuidWorkspaceFootnote
      workspaceDir={workspaceDir}
      onSelectWorkspace={setWorkspaceDir}
      onClearWorkspace={() => setWorkspaceDir('')}
    />
  );
};

describe('Homepage project folder selection', () => {
  beforeEach(() => {
    localStorage.clear();
    showOpenMock.mockReset();
  });

  it('opens the native picker from both the empty and selected states despite recent history', async () => {
    localStorage.setItem(DEFAULT_RECENT_WS_KEY, JSON.stringify(['/projects/recent']));
    showOpenMock.mockResolvedValueOnce(['/projects/first']).mockResolvedValueOnce(['/projects/second']);
    render(<StatefulFootnote />);

    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    await screen.findByText('first');
    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    await screen.findByText('second');

    expect(showOpenMock).toHaveBeenCalledTimes(2);
    expect(showOpenMock).toHaveBeenLastCalledWith({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: '/projects/first',
    });
    expect(screen.queryByText('team.create.chooseDifferentFolder')).not.toBeInTheDocument();
  });

  it('keeps the selected project when the picker is canceled and supports selecting again', async () => {
    showOpenMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(['/projects/next']);
    render(<StatefulFootnote initialValue='/projects/current' />);

    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    await act(async () => {});
    expect(screen.getByText('current')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    await screen.findByText('next');

    expect(showOpenMock).toHaveBeenCalledTimes(2);
  });

  it('recovers after a dialog error and allows the next click to reopen the picker', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    showOpenMock.mockRejectedValueOnce(new Error('Dialog unavailable')).mockResolvedValueOnce(['/projects/retry']);
    render(<StatefulFootnote />);

    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    await screen.findByText('retry');

    expect(showOpenMock).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });

  it('clears the current project without opening a picker', () => {
    render(<StatefulFootnote initialValue='/projects/current' />);

    fireEvent.click(screen.getByRole('button', { name: 'guid.workspace.clearWorkspace' }));

    expect(screen.getByText('guid.workspace.workInProject')).toBeInTheDocument();
    expect(showOpenMock).not.toHaveBeenCalled();
  });
});
