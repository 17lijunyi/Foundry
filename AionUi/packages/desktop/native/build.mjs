import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

if (process.platform === 'darwin') {
  const nativeDir = dirname(fileURLToPath(import.meta.url));
  const headerDir = [
    process.env.AIONUI_NODE_HEADERS,
    resolve(dirname(process.execPath), '../include/node'),
    resolve(homedir(), 'Library/Caches/node-gyp', process.versions.node, 'include/node'),
    '/usr/local/include/node',
    '/opt/homebrew/include/node',
  ].find((candidate) => candidate && existsSync(resolve(candidate, 'node_api.h')));
  if (!headerDir) throw new Error('Node-API headers are required to build the macOS glass surface.');
  const output = resolve(nativeDir, '../../../out/main/native/glass.node');
  mkdirSync(dirname(output), { recursive: true });
  execFileSync(
    'xcrun',
    [
      'clang++',
      '-std=c++17',
      '-fobjc-arc',
      '-shared',
      '-undefined',
      'dynamic_lookup',
      '-mmacosx-version-min=12.0',
      '-arch',
      process.env.AIONUI_NATIVE_ARCH || process.arch,
      '-framework',
      'AppKit',
      '-I',
      headerDir,
      resolve(nativeDir, 'glass.mm'),
      '-o',
      output,
    ],
    { stdio: 'inherit' }
  );
}
