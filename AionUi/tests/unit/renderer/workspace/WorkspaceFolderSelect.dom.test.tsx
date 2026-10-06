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

import WorkspaceFolderSelect from '@/renderer/components/workspace/WorkspaceFolderSelect';
import { DEFAULT_RECENT_WS_KEY } from '@/renderer/components/workspace/recentWorkspaces';

const props = {
  placeholder: 'Choose folder',
  recentLabel: 'Recent folders',
  chooseDifferentLabel: 'Choose another folder',
  triggerTestId: 'folder-select',
  menuTestId: 'recent-folder-menu',
};

const StatefulPicker = ({ initialValue = '' }: { initialValue?: string }) => {
  const [value, setValue] = useState(initialValue);
  return <WorkspaceFolderSelect {...props} value={value} onChange={setValue} />;
};

describe('WorkspaceFolderSelect native folder selection', () => {
  beforeEach(() => {
    localStorage.clear();
    showOpenMock.mockReset();
  });

  it('opens the native folder picker again after a folder has been selected', async () => {
    showOpenMock.mockResolvedValueOnce(['/projects/first']).mockResolvedValueOnce(['/projects/second']);
    render(<StatefulPicker />);

    fireEvent.click(screen.getByTestId('folder-select'));
    await screen.findByText('first');
    fireEvent.click(screen.getByTestId('folder-select'));
    await screen.findByText('second');

    expect(showOpenMock).toHaveBeenCalledTimes(2);
    expect(showOpenMock).toHaveBeenLastCalledWith({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: '/projects/first',
    });
    expect(screen.queryByTestId('recent-folder-menu')).not.toBeInTheDocument();
  });

  it('opens the native picker with persisted history and leaves the selection unchanged on cancellation', async () => {
    localStorage.setItem(DEFAULT_RECENT_WS_KEY, JSON.stringify(['/projects/recent']));
    showOpenMock.mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<WorkspaceFolderSelect {...props} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('folder-select'));
    await waitFor(() => expect(showOpenMock).toHaveBeenCalledTimes(1));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Recent folders')).not.toBeInTheDocument();
  });

  it('keeps the existing folder after cancellation and allows a later selection', async () => {
    showOpenMock.mockResolvedValueOnce([]).mockResolvedValueOnce(['/projects/next']);
    render(<StatefulPicker initialValue='/projects/current' />);

    fireEvent.click(screen.getByTestId('folder-select'));
    await act(async () => {});
    expect(screen.getByText('current')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('folder-select'));
    await screen.findByText('next');

    expect(showOpenMock).toHaveBeenCalledTimes(2);
  });

  it('allows reopening after a native dialog error without changing the previous folder', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    showOpenMock.mockRejectedValueOnce(new Error('Dialog unavailable')).mockResolvedValueOnce(['/projects/retry']);
    render(<StatefulPicker initialValue='/projects/current' />);

    fireEvent.click(screen.getByTestId('folder-select'));
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
    expect(screen.getByText('current')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('folder-select'));
    await screen.findByText('retry');

    expect(showOpenMock).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });

  it('does not open duplicate dialogs while an existing picker is pending', async () => {
    let resolveDialog: ((value: string[]) => void) | undefined;
    showOpenMock.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveDialog = resolve;
        })
    );
    render(<StatefulPicker />);

    fireEvent.click(screen.getByTestId('folder-select'));
    fireEvent.click(screen.getByTestId('folder-select'));
    expect(showOpenMock).toHaveBeenCalledTimes(1);

    await act(async () => resolveDialog?.(['/projects/selected']));
    expect(screen.getByText('selected')).toBeInTheDocument();
  });

  it('clears the selected folder without opening the native picker', () => {
    render(<StatefulPicker initialValue='/projects/current' />);

    fireEvent.click(screen.getByRole('button', { name: 'common.clear' }));

    expect(screen.getByText('Choose folder')).toBeInTheDocument();
    expect(showOpenMock).not.toHaveBeenCalled();
  });
});
