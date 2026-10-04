import type { App } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DATA_DIRECTORY, APP_DISPLAY_NAME } from '@/common/branding';

type AppIdentity = Pick<App, 'isPackaged' | 'getPath' | 'setPath' | 'setName'>;

/** Keep development profiles independent of the installed application. */
export function getDevAppName(env: NodeJS.ProcessEnv = process.env): string {
  return env.AIONUI_MULTI_INSTANCE === '1' ? 'AionUi-Dev-2' : 'AionUi-Dev';
}

/** Apply before any userData read, including early platform auto-registration. */
export function configureAppIdentity(app: AppIdentity, env: NodeJS.ProcessEnv = process.env): void {
  const sandbox = env.AIONUI_E2E_TEST === '1' ? env.AIONUI_E2E_USER_DATA_DIR : undefined;
  if (sandbox?.trim()) {
    fs.mkdirSync(sandbox, { recursive: true });
    app.setPath('userData', sandbox);
    return;
  }

  const name = app.isPackaged ? APP_DISPLAY_NAME : getDevAppName(env);
  const directory = app.isPackaged ? APP_DATA_DIRECTORY : name;
  app.setName(name);
  app.setPath('userData', path.join(app.getPath('appData'), directory));
}
