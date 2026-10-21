import { APP_DISPLAY_NAME } from '@/common/branding';
import appLogo from '@renderer/assets/logos/brand/app.png';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import {
  AlarmClock,
  AllApplication,
  Experiment,
  Home,
  Moon,
  Plus,
  SettingTwo,
  SunOne,
  Check,
  Effects,
} from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { DARK_THEME_ID, GLASS_THEME_ID, LIGHT_THEME_ID } from '@/common/theme/constants';
import styles from './glassNavigation.module.css';

/** Persistent desktop shortcuts; all destinations use the existing application routes. */
const GlassNavigation: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeId, activeTheme, selectTheme } = useThemeContext();
  const [appearanceMenuVisible, setAppearanceMenuVisible] = useState(false);
  const [applyingAppearance, setApplyingAppearance] = useState(false);
  const selectedAppearance = activeId ?? activeTheme?.id ?? GLASS_THEME_ID;
  const appearances = [
    { id: LIGHT_THEME_ID, label: t('settings.backgroundAppearance.white'), icon: SunOne },
    { id: DARK_THEME_ID, label: t('settings.backgroundAppearance.black'), icon: Moon },
    { id: GLASS_THEME_ID, label: t('settings.backgroundAppearance.glass'), icon: Effects },
  ];
  const handleSelectAppearance = async (id: string) => {
    if (applyingAppearance) return;
    setApplyingAppearance(true);
    try {
      await selectTheme(id);
    } catch {
      Message.error(t('settings.cssTheme.applyFailed'));
    } finally {
      setApplyingAppearance(false);
    }
  };
  const destinations = [
    { path: '/guid', label: t('conversation.welcome.newConversation'), icon: Home },
    { path: '/assistants', label: t('settings.assistants'), icon: AllApplication },
    { path: '/model-bench', label: t('common.modelBench.title'), icon: Experiment },
    { path: '/scheduled', label: t('cron.scheduledTasks'), icon: AlarmClock },
    { path: '/settings', label: t('common.settings'), icon: SettingTwo },
  ];
  const active = destinations.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  const themeLabel = t('settings.backgroundAppearance.label');
  const ThemeIcon = appearances.find(({ id }) => id === selectedAppearance)?.icon ?? Effects;

  return (
    <>
      <nav className={styles.rail} data-glass-region='rail' aria-label={t('guid.glass.navigation')}>
        {destinations.map(({ path, label, icon: Icon }) => (
          <Tooltip key={path} content={label} position='right'>
            <Button
              type='text'
              className={styles.railButton}
              aria-label={label}
              aria-current={active?.path === path ? 'page' : undefined}
              onClick={() => void navigate(path)}
              icon={<Icon size={22} strokeWidth={2.5} />}
            />
          </Tooltip>
        ))}
        <span className={styles.divider} aria-hidden='true' />
        <Dropdown
          trigger='click'
          popupVisible={appearanceMenuVisible}
          onVisibleChange={setAppearanceMenuVisible}
          triggerProps={{ position: 'rt' }}
          droplist={
            <Menu
              selectedKeys={[selectedAppearance]}
              onClickMenuItem={(id) => void handleSelectAppearance(id)}
              aria-label={themeLabel}
            >
              {appearances.map(({ id, label, icon: Icon }) => (
                <Menu.Item
                  key={id}
                  role='menuitemradio'
                  aria-checked={selectedAppearance === id}
                  disabled={applyingAppearance}
                >
                  <span className='flex items-center gap-10px min-w-140px'>
                    <Icon size={18} />
                    <span className='flex-1'>{label}</span>
                    {selectedAppearance === id && <Check size={16} aria-hidden='true' />}
                  </span>
                </Menu.Item>
              ))}
            </Menu>
          }
        >
          <Button
            type='text'
            className={styles.railButton}
            aria-label={themeLabel}
            title={themeLabel}
            aria-haspopup='menu'
            aria-expanded={appearanceMenuVisible}
            loading={applyingAppearance}
            icon={<ThemeIcon size={21} strokeWidth={2.5} />}
          />
        </Dropdown>
      </nav>
      <nav className={styles.dock} data-glass-region='dock' aria-label={t('guid.glass.quickActions')}>
        <img src={appLogo} alt='' className={styles.brandIcon} draggable={false} />
        <span className={styles.dockIdentity}>
          <strong>{active?.label ?? t('guid.glass.workspace')}</strong>
          <span>{APP_DISPLAY_NAME}</span>
        </span>
        <span className={styles.dockDivider} aria-hidden='true' />
        <Button
          type='text'
          className={styles.newConversation}
          icon={<Plus size={18} strokeWidth={2.5} />}
          onClick={() => void navigate('/guid', { state: { resetAssistant: true } })}
        >
          {t('conversation.welcome.newConversation')}
        </Button>
      </nav>
    </>
  );
};

export default GlassNavigation;
