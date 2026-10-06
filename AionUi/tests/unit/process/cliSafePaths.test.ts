import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPlatformServices } from '@/common/platform';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';
import { getConfigPath, getDataPath } from '@process/utils/utils';

let root: string;
let testHome: string;
let profile: string;
let packaged = true;

const aliases = ['.aionui', '.aionui-config'];
const directories = ['aionui', 'config'];
const resolvePaths = () => [getDataPath(), getConfigPath()];
const aliasPaths = () => aliases.map((alias) => path.join(testHome, packaged ? alias : `${alias}-dev`));
const profilePaths = () => directories.map((directory) => path.join(profile, directory));

const seedDanglingAliases = () => {
  const targets = directories.map((directory) => path.join(root, 'deleted-profile', directory));
  aliasPaths().forEach((alias, index) => fs.symlinkSync(targets[index], alias));
  return targets;
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-cli-paths-'));
  testHome = path.join(root, 'home');
  profile = path.join(root, 'profile');
  packaged = true;
  fs.mkdirSync(testHome);
  const services = new NodePlatformServices();
  services.paths = {
    ...services.paths,
    getDataDir: () => profile,
    getHomeDir: () => testHome,
    isPackaged: () => packaged,
    needsCliSafeSymlinks: () => true,
  };
  registerPlatformServices(services);
  vi.stubEnv('AIONUI_MULTI_INSTANCE', undefined);
  vi.stubEnv('AIONUI_E2E_TEST', undefined);
  vi.stubEnv('AIONUI_E2E_USER_DATA_DIR', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  registerPlatformServices(new NodePlatformServices());
  fs.rmSync(root, { recursive: true, force: true });
});

describe('CLI-safe data and configuration paths', () => {
  it('preserves both shared aliases when a disposable E2E profile is active', () => {
    const originalTargets = seedDanglingAliases();
    vi.stubEnv('AIONUI_E2E_TEST', '1');
    vi.stubEnv('AIONUI_E2E_USER_DATA_DIR', profile);
    const createLink = vi.spyOn(fs, 'symlinkSync');
    const removeLink = vi.spyOn(fs, 'unlinkSync');
    const createDirectory = vi.spyOn(fs, 'mkdirSync');

    expect(resolvePaths()).toEqual(profilePaths());
    expect(aliasPaths().map((alias) => fs.readlinkSync(alias))).toEqual(originalTargets);
    expect([createLink.mock.calls, removeLink.mock.calls, createDirectory.mock.calls]).toEqual([[], [], []]);
  });

  it('does not create global aliases for an E2E profile on a fresh home directory', () => {
    vi.stubEnv('AIONUI_E2E_TEST', '1');
    vi.stubEnv('AIONUI_E2E_USER_DATA_DIR', profile);

    expect(resolvePaths()).toEqual(profilePaths());
    expect(fs.readdirSync(testHome)).toEqual([]);
    expect(profilePaths().map((directory) => fs.existsSync(directory))).toEqual([false, false]);
  });

  it.each([true, false])('repairs dangling aliases after E2E mode is removed (packaged=%s)', (isPackaged) => {
    packaged = isPackaged;
    seedDanglingAliases();
    vi.stubEnv('AIONUI_E2E_TEST', '1');
    vi.stubEnv('AIONUI_E2E_USER_DATA_DIR', profile);
    expect(resolvePaths()).toEqual(profilePaths());

    // A sandbox variable on its own must not change normal release/dev behavior.
    vi.stubEnv('AIONUI_E2E_TEST', undefined);

    expect({
      resolved: resolvePaths(),
      targets: aliasPaths().map((alias) => fs.readlinkSync(alias)),
      directoriesExist: profilePaths().map((directory) => fs.existsSync(directory)),
    }).toEqual({
      resolved: aliasPaths(),
      targets: profilePaths(),
      directoriesExist: [true, true],
    });
  });

  it.each([undefined, '', '  '])('retains normal alias repair without a usable E2E directory (%j)', (sandbox) => {
    seedDanglingAliases();
    vi.stubEnv('AIONUI_E2E_TEST', '1');
    vi.stubEnv('AIONUI_E2E_USER_DATA_DIR', sandbox);

    expect(resolvePaths()).toEqual(aliasPaths());
    expect(aliasPaths().map((alias) => fs.readlinkSync(alias))).toEqual(profilePaths());
  });
});
