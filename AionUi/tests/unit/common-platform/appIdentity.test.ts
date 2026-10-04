import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureAppIdentity } from '@/common/platform/appIdentity';

const appData = path.join(os.tmpdir(), 'foundry-profile-test');
const sandboxRoots: string[] = [];
const createApp = (isPackaged = true) => ({
  isPackaged,
  getPath: vi.fn((name: string) => {
    if (name !== 'appData') throw new Error('User data must be configured before it is read');
    return appData;
  }),
  setName: vi.fn(),
  setPath: vi.fn(),
});

afterEach(() => {
  for (const directory of sandboxRoots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('application identity and profile compatibility', () => {
  it('opens the original installed profile under the new display name', () => {
    const app = createApp();
    configureAppIdentity(app, {});
    expect(app.setName).toHaveBeenCalledWith('Foundry');
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(appData, '产品经理工作台'));
  });

  it('keeps the same profile when both bootstrap paths configure the application', () => {
    const app = createApp();
    configureAppIdentity(app, {});
    configureAppIdentity(app, {});
    expect(app.setPath.mock.calls).toEqual([
      ['userData', path.join(appData, '产品经理工作台')],
      ['userData', path.join(appData, '产品经理工作台')],
    ]);
  });

  it.each([
    [{}, 'AionUi-Dev'],
    [{ AIONUI_MULTI_INSTANCE: '1' }, 'AionUi-Dev-2'],
  ])('isolates development profiles with %j', (env, name) => {
    const app = createApp(false);
    configureAppIdentity(app, env);
    expect(app.setName).toHaveBeenCalledWith(name);
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(appData, name));
  });

  it('creates and retains an explicit test sandbox before any platform path is read', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-e2e-'));
    sandboxRoots.push(root);
    const sandbox = path.join(root, 'profile');
    const app = createApp(false);
    configureAppIdentity(app, { AIONUI_E2E_TEST: '1', AIONUI_E2E_USER_DATA_DIR: sandbox });
    expect(fs.existsSync(sandbox)).toBe(true);
    expect(app.setPath).toHaveBeenCalledWith('userData', sandbox);
    expect(app.getPath).not.toHaveBeenCalled();
  });

  it('does not redirect production data merely because a test directory variable exists', () => {
    const app = createApp();
    configureAppIdentity(app, { AIONUI_E2E_USER_DATA_DIR: '/unused-test-directory' });
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(appData, '产品经理工作台'));
  });

  it('ignores a blank test sandbox and retains development isolation', () => {
    const app = createApp(false);
    configureAppIdentity(app, { AIONUI_E2E_TEST: '1', AIONUI_E2E_USER_DATA_DIR: '  ' });
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(appData, 'AionUi-Dev'));
  });

  it('fails closed when a requested sandbox is invalid instead of using the real profile', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-e2e-'));
    sandboxRoots.push(root);
    const file = path.join(root, 'not-a-directory');
    fs.writeFileSync(file, 'test');
    const app = createApp();
    expect(() => configureAppIdentity(app, { AIONUI_E2E_TEST: '1', AIONUI_E2E_USER_DATA_DIR: file })).toThrow();
    expect(app.setPath).not.toHaveBeenCalled();
  });
});
