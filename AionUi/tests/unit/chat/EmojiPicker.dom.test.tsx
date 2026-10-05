import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Button, ConfigProvider } from '@arco-design/web-react';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('EmojiPicker', () => {
  it('opens all 21 character avatars before emoji and returns the selected backend route unchanged', async () => {
    const onChange = vi.fn();
    const avatars = Array.from({ length: 21 }, (_, index) => ({
      id: `official-${index}`,
      label: `Character ${index + 1}`,
      src: `/api/assistants/official-${index}/avatar`,
    }));

    render(
      <ConfigProvider>
        <EmojiPicker value='🤖' builtinAvatars={avatars} onChange={onChange}>
          <Button>Open picker</Button>
        </EmojiPicker>
      </ConfigProvider>
    );

    fireEvent.click(screen.getByText('Open picker'));
    const tabs = screen.getAllByRole('tab');
    const tabTitles = tabs.map((tab) => tab.textContent);
    expect(tabTitles).toEqual(['👤 Character avatars', '🙂 Emoji']);
    expect(screen.getAllByRole('button', { name: /^Character \d+$/ })).toHaveLength(21);

    fireEvent.click(screen.getByRole('button', { name: 'Character 21' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/api/assistants/official-20/avatar');
    });
  });

  it('shows the controlled selection when reopened after choosing a character', async () => {
    const options = [{ id: 'writer', label: 'Writer', src: '/api/assistants/writer/avatar' }];
    const Harness = () => {
      const [value, setValue] = useState('🤖');
      return (
        <EmojiPicker value={value} onChange={setValue} builtinAvatars={options}>
          <Button>Open picker</Button>
        </EmojiPicker>
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open picker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Writer', pressed: false }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Character avatars/ })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open picker' }));
    expect(screen.getByRole('button', { name: 'Writer', pressed: true })).toBeInTheDocument();
  });

  it('keeps emoji usable without an official catalog', () => {
    const onChange = vi.fn();
    render(
      <EmojiPicker onChange={onChange}>
        <Button>Open picker</Button>
      </EmojiPicker>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open picker' }));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '😎', pressed: false }));
    expect(onChange).toHaveBeenCalledWith('😎');
  });

  it('returns to the character library on reopening even after browsing emoji', async () => {
    render(
      <EmojiPicker builtinAvatars={[{ id: 'writer', label: 'Writer', src: '/api/assistants/writer/avatar' }]}>
        <Button>Open picker</Button>
      </EmojiPicker>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open picker' }));
    fireEvent.click(screen.getByRole('tab', { name: /Emoji/ }));
    fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: '😎', pressed: false }));
    await waitFor(() => expect(screen.queryByRole('tab')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open picker' }));
    expect(screen.getByRole('button', { name: 'Writer' })).toBeInTheDocument();
  });
});
