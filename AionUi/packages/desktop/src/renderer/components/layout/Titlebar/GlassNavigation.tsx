import { APP_DISPLAY_NAME } from '@/common/branding';
import appLogo from '@renderer/assets/logos/brand/app.png';
import { Button, Tooltip } from '@arco-design/web-react';
import { AlarmClock, AllApplication, Experiment, Home, Moon, Plus, SettingTwo, SunOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import styles from './glassNavigation.module.css';

/** Persistent desktop shortcuts; all destinations use the existing application routes. */
const GlassNavigation: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeContext();
  const destinations = [
    { path: '/guid', label: t('conversation.welcome.newConversation'), icon: Home },
    { path: '/assistants', label: t('settings.assistants'), icon: AllApplication },
    { path: '/model-bench', label: t('common.modelBench.title'), icon: Experiment },
    { path: '/scheduled', label: t('cron.scheduledTasks'), icon: AlarmClock },
    { path: '/settings', label: t('common.settings'), icon: SettingTwo },
  ];
  const active = destinations.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  const themeLabel = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  const ThemeIcon = theme === 'dark' ? SunOne : Moon;

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
        <Tooltip content={themeLabel} position='right'>
          <Button
            type='text'
            className={styles.railButton}
            aria-label={themeLabel}
            onClick={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
            icon={<ThemeIcon size={21} strokeWidth={2.5} />}
          />
        </Tooltip>
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
