import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { extensionTabs, resolveExtTabName } = vi.hoisted(() => ({
  extensionTabs: [{ id: 'extension-settings', name: 'Extension', url: '/extension', extensionName: 'test' }],
  resolveExtTabName: () => 'Extension',
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  resolveExtensionAssetUrl: () => '',
}));
vi.mock('@/renderer/hooks/system/useExtensionSettingsTabs', () => ({
  useExtensionSettingsTabs: () => extensionTabs,
}));
vi.mock('@/renderer/hooks/system/useExtI18n', () => ({ useExtI18n: () => ({ resolveExtTabName }) }));
vi.mock('@/renderer/pages/settings/components/SettingsSider', () => ({ LEGACY_ANCHOR_REMAP: {} }));
vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/ModelModalContent', () => ({
  default: () => <div>Model content</div>,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/AgentModalContent', () => ({
  default: () => <div>Agent content</div>,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/ToolsModalContent', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/WebuiModalContent', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div>System content</div>,
}));
vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent', () => ({
  default: () => <div>Extension content</div>,
}));

import SettingsModal from '@/renderer/components/settings/SettingsModal';

afterEach(cleanup);

describe('connection settings modal navigation', () => {
  it('opens the requested connection page after mounting while closed', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<SettingsModal visible={false} onCancel={onCancel} defaultTab='model' />);

    rerender(<SettingsModal visible onCancel={onCancel} defaultTab='agent' />);

    expect(screen.getByText('Agent content')).toBeInTheDocument();
    expect(screen.queryByText('Model content')).not.toBeInTheDocument();
  });

  it('resets a previously visited tab when reopening the same requested connection page', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<SettingsModal visible onCancel={onCancel} defaultTab='model' />);
    fireEvent.click(screen.getByText('settings.system'));
    expect(screen.getByText('System content')).toBeInTheDocument();

    rerender(<SettingsModal visible={false} onCancel={onCancel} defaultTab='model' />);
    rerender(<SettingsModal visible onCancel={onCancel} defaultTab='model' />);

    expect(screen.getByText('Model content')).toBeInTheDocument();
    expect(screen.queryByText('System content')).not.toBeInTheDocument();
  });

  it('remounts an extension settings page instead of reopening a blank panel', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<SettingsModal visible onCancel={onCancel} defaultTab='extension-settings' />);
    expect(screen.getByText('Extension content')).toBeInTheDocument();

    rerender(<SettingsModal visible={false} onCancel={onCancel} defaultTab='extension-settings' />);
    rerender(<SettingsModal visible onCancel={onCancel} defaultTab='extension-settings' />);

    expect(screen.getByText('Extension content')).toBeInTheDocument();
  });
});
