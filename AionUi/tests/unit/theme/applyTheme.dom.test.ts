import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from '@/renderer/utils/theme/applyTheme';
import type { Theme } from '@/common/theme/types';
import { readFileSync } from 'node:fs';

const base = { builtin: true, created_at: 0, updated_at: 0 };

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-surface');
  document.body.removeAttribute('arco-theme');
  document.getElementById('theme-tokens')?.remove();
  document.getElementById('theme-decoration')?.remove();
});

describe('applyTheme', () => {
  it.each(['solid', 'glass'] as const)('applies the %s material independently of light/dark', (surface) => {
    applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark', surface });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-surface')).toBe(surface);
  });
  it('preserves glass material for an older custom theme without a surface field', () => {
    applyTheme({ ...base, id: 'legacy', name: 'Legacy', appearance: 'light', builtin: false });
    expect(document.documentElement.getAttribute('data-surface')).toBe('glass');
  });
  it('sets appearance attributes', () => {
    applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
  });
  it('defers arco-theme (does not silently skip) when body is not ready, then converges on DOMContentLoaded', () => {
    // jsdom always has a body, so simulate early boot (readyState === 'loading')
    // where documentElement exists but body is null. The old `root.body?.setAttribute`
    // would silently skip arco-theme here, leaving data-theme dark and Arco light.
    const realBody = document.body;
    let bodyReady = false;
    Object.defineProperty(document, 'body', {
      configurable: true,
      get: () => (bodyReady ? realBody : null),
    });
    try {
      realBody.removeAttribute('arco-theme');
      document.documentElement.removeAttribute('data-theme');

      applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme, document);

      // data-theme lands immediately (documentElement always exists)...
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      // ...but arco-theme must be deferred, NOT lost. If the fix regressed to the
      // old silent-skip, no listener is registered and this attribute stays null
      // forever — the assertions below then fail (this is a real no-op guard).
      expect(realBody.getAttribute('arco-theme')).toBeNull();

      bodyReady = true;
      document.dispatchEvent(new Event('DOMContentLoaded'));

      // Both attributes now converge — no silent dark/light split.
      expect(realBody.getAttribute('arco-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      // Restore jsdom's native body getter for the remaining tests.
      Reflect.deleteProperty(document, 'body');
    }
  });
  it('injects decoration css when present and removes when absent', () => {
    applyTheme({ ...base, id: 'hk', name: 'HK', appearance: 'light', css: 'body{color:red}' } as Theme);
    expect(document.getElementById('theme-decoration')?.textContent).toContain('color:red');
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    expect(document.getElementById('theme-decoration')).toBeNull();
  });
  it('writes tokens to a :root style block when present', () => {
    applyTheme({ ...base, id: 't', name: 'T', appearance: 'light', tokens: { '--primary': '#abc' } } as Theme);
    expect(document.getElementById('theme-tokens')?.textContent).toContain('--primary: #abc');
  });
  it('injects layered light/dark tokens under :root[data-theme] and removes them when absent', () => {
    applyTheme({
      ...base,
      id: 'layered',
      name: 'Layered',
      appearance: 'light',
      tokens: { light: { '--primary': '#0a7ea4' }, dark: { '--primary': '#38bdf8' } },
    } as Theme);
    const css = document.getElementById('theme-tokens')?.textContent ?? '';
    expect(css).toContain(":root[data-theme='light']");
    expect(css).toContain('--primary: #0a7ea4');
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--primary: #38bdf8');

    // Switching to a theme without tokens must clear the block.
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    expect(document.getElementById('theme-tokens')).toBeNull();
  });
});

describe('startup appearance restoration', () => {
  const html = readFileSync('packages/desktop/src/renderer/index.html', 'utf8');
  const startupScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-surface', 'solid');
  });

  it.each([
    ['light', 'solid'],
    ['dark', 'solid'],
    ['light', 'glass'],
  ])('restores %s / %s before the renderer starts', (appearance, surface) => {
    localStorage.setItem('__aionui_theme', appearance);
    localStorage.setItem('__aionui_surface', surface);
    new Function(startupScript!)();
    expect(document.documentElement.getAttribute('data-theme')).toBe(appearance);
    expect(document.documentElement.getAttribute('data-surface')).toBe(surface);
  });

  it('preserves glass for an old appearance-only cache', () => {
    localStorage.setItem('__aionui_theme', 'dark');
    new Function(startupScript!)();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-surface')).toBe('glass');
  });

  it('ignores malformed cached material values', () => {
    localStorage.setItem('__aionui_surface', 'unexpected');
    new Function(startupScript!)();
    expect(document.documentElement.getAttribute('data-surface')).toBe('solid');
  });
});
