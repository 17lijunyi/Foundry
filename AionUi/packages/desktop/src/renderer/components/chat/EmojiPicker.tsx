/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty, Popover, Tabs, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';

// Common emoji categories with popular emojis
const EMOJI_CATEGORIES = {
  recent: {
    icon: '🕐',
    label: 'settings.emojiCategories.recent' as const,
    emojis: [] as string[], // Will be populated from localStorage
  },
  smileys: {
    icon: '😀',
    label: 'settings.emojiCategories.smileys' as const,
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😅',
      '😂',
      '🤣',
      '😊',
      '😇',
      '🙂',
      '🙃',
      '😉',
      '😌',
      '😍',
      '🥰',
      '😘',
      '😗',
      '😙',
      '😚',
      '😋',
      '😛',
      '😜',
      '🤪',
      '😝',
      '🤑',
      '🤗',
      '🤭',
      '🤫',
      '🤔',
      '🤐',
      '🤨',
      '😐',
      '😑',
      '😶',
      '😏',
      '😒',
      '🙄',
      '😬',
      '🤥',
      '😌',
      '😔',
      '😪',
      '🤤',
      '😴',
      '😷',
      '🤒',
      '🤕',
      '🤢',
      '🤮',
      '🥵',
      '🥶',
      '🥴',
      '😵',
      '🤯',
      '🤠',
      '🥳',
      '😎',
      '🤓',
      '🧐',
      '😕',
      '😟',
      '🙁',
      '☹️',
      '😮',
    ],
  },
  animals: {
    icon: '🐱',
    label: 'settings.emojiCategories.animals' as const,
    emojis: [
      '🐶',
      '🐱',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🐤',
      '🦆',
      '🦅',
      '🦉',
      '🦇',
      '🐺',
      '🐗',
      '🐴',
      '🦄',
      '🐝',
      '🐛',
      '🦋',
      '🐌',
      '🐞',
      '🐜',
      '🦟',
      '🦗',
      '🕷',
      '🦂',
      '🐢',
      '🐍',
      '🦎',
      '🦖',
      '🦕',
      '🐙',
      '🦑',
      '🦐',
      '🦞',
      '🦀',
      '🐡',
      '🐠',
      '🐟',
      '🐬',
      '🐳',
      '🐋',
      '🦈',
      '🐊',
      '🐅',
    ],
  },
  food: {
    icon: '🍎',
    label: 'settings.emojiCategories.food' as const,
    emojis: [
      '🍎',
      '🍐',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍈',
      '🍒',
      '🍑',
      '🥭',
      '🍍',
      '🥥',
      '🥝',
      '🍅',
      '🍆',
      '🥑',
      '🥦',
      '🥬',
      '🥒',
      '🌶',
      '🫑',
      '🌽',
      '🥕',
      '🧄',
      '🧅',
      '🥔',
      '🍠',
      '🥐',
      '🥯',
      '🍞',
      '🥖',
      '🥨',
      '🧀',
      '🥚',
      '🍳',
      '🧈',
      '🥞',
      '🧇',
      '🥓',
      '🥩',
      '🍗',
      '🍖',
      '🦴',
      '🌭',
      '🍔',
      '🍟',
      '🍕',
      '🫓',
      '🥪',
      '🥙',
      '🧆',
      '🌮',
      '🌯',
    ],
  },
  activities: {
    icon: '⚽',
    label: 'settings.emojiCategories.activities' as const,
    emojis: [
      '⚽',
      '🏀',
      '🏈',
      '⚾',
      '🥎',
      '🎾',
      '🏐',
      '🏉',
      '🥏',
      '🎱',
      '🪀',
      '🏓',
      '🏸',
      '🏒',
      '🏑',
      '🥍',
      '🏏',
      '🪃',
      '🥅',
      '⛳',
      '🪁',
      '🏹',
      '🎣',
      '🤿',
      '🥊',
      '🥋',
      '🎽',
      '🛹',
      '🛼',
      '🛷',
      '⛸',
      '🥌',
      '🎿',
      '⛷',
      '🏂',
      '🪂',
      '🏋️',
      '🤼',
      '🤸',
      '⛹️',
      '🤺',
      '🤾',
      '🏌️',
      '🏇',
      '🧘',
      '🏄',
      '🏊',
      '🤽',
      '🚣',
      '🧗',
      '🚵',
      '🚴',
      '🏆',
      '🥇',
      '🥈',
      '🥉',
    ],
  },
  objects: {
    icon: '💡',
    label: 'settings.emojiCategories.objects' as const,
    emojis: [
      '💡',
      '🔦',
      '🏮',
      '🪔',
      '📱',
      '💻',
      '🖥',
      '🖨',
      '⌨️',
      '🖱',
      '🖲',
      '💾',
      '💿',
      '📀',
      '📼',
      '📷',
      '📸',
      '📹',
      '🎥',
      '📽',
      '🎬',
      '📺',
      '📻',
      '🎙',
      '🎚',
      '🎛',
      '🧭',
      '⏱',
      '⏲',
      '⏰',
      '🕰',
      '⌛',
      '📡',
      '🔋',
      '🔌',
      '💎',
      '🔧',
      '🔨',
      '⚒',
      '🛠',
      '🔩',
      '⚙️',
      '🧱',
      '⛓',
      '🧲',
      '🔫',
      '💣',
      '🔪',
      '🗡',
      '⚔️',
      '🛡',
      '🚬',
      '⚰️',
      '🪦',
      '⚱️',
      '🏺',
    ],
  },
  symbols: {
    icon: '❤️',
    label: 'settings.emojiCategories.symbols' as const,
    emojis: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '🤎',
      '💔',
      '❣️',
      '💕',
      '💞',
      '💓',
      '💗',
      '💖',
      '💘',
      '💝',
      '💟',
      '☮️',
      '✝️',
      '☪️',
      '🕉',
      '☸️',
      '✡️',
      '🔯',
      '🕎',
      '☯️',
      '☦️',
      '🛐',
      '⛎',
      '♈',
      '♉',
      '♊',
      '♋',
      '♌',
      '♍',
      '♎',
      '♏',
      '♐',
      '♑',
      '♒',
      '♓',
      '🆔',
      '⚛️',
      '🉑',
      '☢️',
      '☣️',
      '📴',
      '📳',
      '🈶',
      '🈚',
      '🈸',
      '🈺',
      '🈷️',
      '✴️',
    ],
  },
  flags: {
    icon: '🏁',
    label: 'settings.emojiCategories.flags' as const,
    emojis: [
      '🏁',
      '🚩',
      '🎌',
      '🏴',
      '🏳️',
      '🏳️‍🌈',
      '🏳️‍⚧️',
      '🏴‍☠️',
      '🇨🇳',
      '🇺🇸',
      '🇯🇵',
      '🇰🇷',
      '🇬🇧',
      '🇫🇷',
      '🇩🇪',
      '🇮🇹',
      '🇪🇸',
      '🇷🇺',
      '🇧🇷',
      '🇮🇳',
      '🇦🇺',
      '🇨🇦',
      '🇲🇽',
      '🇦🇷',
    ],
  },
};

type CategoryKey = keyof typeof EMOJI_CATEGORIES;

const RECENT_EMOJIS_KEY = 'aionui.emoji.recent';
const MAX_RECENT_EMOJIS = 24;

// Arco Design Popover position types
type PopoverPosition = 'top' | 'bottom' | 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br' | 'lt' | 'lb' | 'rt' | 'rb';

type EmojiPickerProps = {
  value?: string;
  onChange?: (emoji: string) => void;
  children?: React.ReactNode;
  placement?: PopoverPosition;
  builtinAvatars?: Array<{
    id: string;
    label: string;
    src: string;
  }>;
};

const EmojiPicker: React.FC<EmojiPickerProps> = ({
  value,
  onChange,
  children,
  placement = 'bl',
  builtinAvatars = [],
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('smileys');
  const [activeTab, setActiveTab] = useState<'emoji' | 'builtin'>(builtinAvatars.length > 0 ? 'builtin' : 'emoji');

  // Load recent emojis from localStorage
  const recentEmojis = useMemo(() => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, [visible]); // Refresh when popover opens

  const saveRecentEmoji = useCallback((emoji: string) => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      let recent: string[] = stored ? JSON.parse(stored) : [];
      // Remove if already exists, then add to front
      recent = recent.filter((e) => e !== emoji);
      recent.unshift(emoji);
      // Keep only MAX_RECENT_EMOJIS
      recent = recent.slice(0, MAX_RECENT_EMOJIS);
      localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recent));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      saveRecentEmoji(emoji);
      onChange?.(emoji);
      setVisible(false);
    },
    [onChange, saveRecentEmoji]
  );

  const handleSelectBuiltinAvatar = useCallback(
    (src: string) => {
      onChange?.(src);
      setVisible(false);
    },
    [onChange]
  );

  const currentEmojis = useMemo(() => {
    if (activeCategory === 'recent') {
      return recentEmojis;
    }
    return EMOJI_CATEGORIES[activeCategory].emojis;
  }, [activeCategory, recentEmojis]);

  const categoryKeys = useMemo(() => {
    const keys = Object.keys(EMOJI_CATEGORIES) as CategoryKey[];
    // Only show recent if there are recent emojis
    if (recentEmojis.length === 0) {
      return keys.filter((key) => key !== 'recent');
    }
    return keys;
  }, [recentEmojis.length]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setActiveTab(builtinAvatars.length > 0 ? 'builtin' : 'emoji');
  }, [builtinAvatars.length, visible]);

  const emojiPickerContent = (
    <div className='w-280px'>
      {/* Category Tabs */}
      <div className='flex items-center gap-2px px-8px py-6px border-b border-[var(--color-border-2)] overflow-x-auto'>
        {categoryKeys.map((key) => (
          <Button
            key={key}
            type='text'
            className={`!flex-shrink-0 !w-28px !h-28px !p-0 !rounded-md !text-16px ${activeCategory === key ? '!bg-fill-2' : ''}`}
            onClick={() => setActiveCategory(key)}
            title={t(EMOJI_CATEGORIES[key].label)}
            aria-label={t(EMOJI_CATEGORIES[key].label)}
            aria-pressed={activeCategory === key}
          >
            {EMOJI_CATEGORIES[key].icon}
          </Button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className='p-8px max-h-200px overflow-y-auto'>
        {currentEmojis.length > 0 ? (
          <div className='grid grid-cols-8 gap-2px'>
            {currentEmojis.map((emoji: string, index: number) => (
              <Button
                key={`${emoji}-${index}`}
                type='text'
                className='!w-32px !h-32px !p-0 !text-20px !rounded-md'
                onClick={() => handleSelectEmoji(emoji)}
                aria-label={emoji}
                aria-pressed={value === emoji}
              >
                {emoji}
              </Button>
            ))}
          </div>
        ) : (
          <div className='text-center text-t-secondary py-16px text-14px'>
            {t('settings.noRecentEmojis', { defaultValue: 'No recent emojis' })}
          </div>
        )}
      </div>
    </div>
  );

  const builtinAvatarContent = (
    <div className='w-280px p-8px max-h-264px overflow-y-auto'>
      {builtinAvatars.length > 0 ? (
        <div className='grid grid-cols-4 gap-8px'>
          {builtinAvatars.map((avatarOption) => {
            const isSelected = avatarOption.src === value;
            return (
              <Tooltip key={avatarOption.id} content={avatarOption.label}>
                <Button
                  type='text'
                  aria-label={avatarOption.label}
                  aria-pressed={isSelected}
                  className={`!h-auto !w-full !justify-start !rounded-10px !border !border-solid !px-4px !py-8px transition-colors ${
                    isSelected ? 'border-primary bg-primary-1' : 'border-transparent bg-transparent hover:bg-fill-1'
                  }`}
                  onClick={() => handleSelectBuiltinAvatar(avatarOption.src)}
                >
                  <div className='flex w-full items-center justify-center'>
                    <div className='h-48px w-48px overflow-hidden rounded-10px bg-fill-1'>
                      <ThemedLogo src={avatarOption.src} alt='' className='h-full w-full object-cover' pixelated />
                    </div>
                  </div>
                </Button>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <Empty description={t('settings.assistantAvatarNoBuiltinImages', { defaultValue: 'No built-in images' })} />
      )}
    </div>
  );

  const pickerContent =
    builtinAvatars.length > 0 ? (
      <div className='w-280px'>
        <Tabs activeTab={activeTab} onChange={(key) => setActiveTab(key as 'emoji' | 'builtin')} size='small'>
          <Tabs.TabPane
            key='builtin'
            title={
              <span className='flex items-center gap-4px'>
                <span aria-hidden='true'>👤</span>{' '}
                <span>{t('settings.assistantAvatarBuiltinTab', { defaultValue: 'Character avatars' })}</span>
              </span>
            }
          >
            {builtinAvatarContent}
          </Tabs.TabPane>
          <Tabs.TabPane
            key='emoji'
            title={
              <span className='flex items-center gap-4px'>
                <span aria-hidden='true'>🙂</span>{' '}
                <span>{t('settings.assistantAvatarEmojiTab', { defaultValue: 'Emoji' })}</span>
              </span>
            }
          >
            {emojiPickerContent}
          </Tabs.TabPane>
        </Tabs>
      </div>
    ) : (
      emojiPickerContent
    );

  return (
    <Popover
      trigger='click'
      position={placement}
      popupVisible={visible}
      onVisibleChange={setVisible}
      content={pickerContent}
      unmountOnExit
    >
      {children || (
        <Button
          type='text'
          aria-label={t(
            builtinAvatars.length > 0 ? 'settings.assistantAvatarBuiltinTab' : 'settings.assistantAvatarEmojiTab'
          )}
          className='!w-40px !h-40px !p-0 !text-24px !bg-fill-2 !rounded-lg'
        >
          {value || '😀'}
        </Button>
      )}
    </Popover>
  );
};

export default EmojiPicker;
