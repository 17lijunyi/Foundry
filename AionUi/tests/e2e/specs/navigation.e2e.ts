/**
 * Navigation – route transitions and sidebar.
 *
 * Ensures the app can navigate between the guid/chat page and all
 * settings sub-pages without errors.
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  goToSettings,
  navigateTo,
  ROUTES,
  expectUrlContains,
  takeScreenshot,
  type SettingsTab,
} from '../helpers';

// ── Guid Page ────────────────────────────────────────────────────────────────

test.describe('Guid Page', () => {
  test('navigates to guid page', async ({ page }) => {
    await goToGuid(page);
    await expectUrlContains(page, 'guid');
  });

  test('chat input area is present', async ({ page }) => {
    await goToGuid(page);
    const textarea = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });

  test('can type in chat input', async ({ page }) => {
    await goToGuid(page);
    const input = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    await input.click();
    await input.fill('E2E test message');
    const value = await input.inputValue().catch(() => input.textContent());
    expect(value).toContain('E2E test');
  });

  test('screenshot: guid page', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToGuid(page);
    await takeScreenshot(page, 'guid-page', { fullPage: true });
  });
});

// ── Settings Pages ───────────────────────────────────────────────────────────

test.describe('Settings Pages', () => {
  const tabs: {
    tab: SettingsTab;
    target?: SettingsTab;
    name: string;
    content: { kind: 'heading' | 'text'; name: RegExp };
  }[] = [
    // Gemini no longer has a separate settings entry; agent configuration lives here.
    {
      tab: 'gemini',
      target: 'agent',
      name: 'Gemini configuration via Agent Settings',
      content: { kind: 'heading', name: /^Agents$/ },
    },
    { tab: 'model', name: 'Model Settings', content: { kind: 'heading', name: /^(Model|模型)$/ } },
    { tab: 'agent', name: 'Agent/ACP Settings', content: { kind: 'heading', name: /^Agents$/ } },
    { tab: 'tools', name: 'Tools/MCP Settings', content: { kind: 'heading', name: /^(Tools|工具)$/ } },
    { tab: 'display', name: 'Appearance Settings', content: { kind: 'text', name: /^(Theme|主题)$/ } },
    { tab: 'webui', name: 'WebUI Settings', content: { kind: 'heading', name: /^WebUI$/ } },
    { tab: 'system', name: 'System Settings', content: { kind: 'text', name: /^(Language|语言)$/ } },
    { tab: 'about', name: 'About Page', content: { kind: 'heading', name: /^Foundry$/ } },
  ];

  for (const { tab, target, name, content } of tabs) {
    test(`${name} loads`, async ({ page }) => {
      const destination = target ?? tab;
      await goToSettings(page, destination);
      await expect(page).toHaveURL((url) => url.hash === ROUTES.settings[destination]);
      const settingsContent = page.locator('.settings-page-content');
      const marker =
        content.kind === 'heading'
          ? settingsContent.getByRole('heading', { name: content.name })
          : settingsContent.getByText(content.name);
      await expect(marker).toBeVisible();
    });
  }

  test('screenshot: settings pages', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    for (const { tab, target } of tabs) {
      await goToSettings(page, target ?? tab);
      await takeScreenshot(page, `settings-${tab}`);
    }
    await navigateTo(page, '#/assistants');
    await expect(page.getByRole('heading', { name: /^(Assistants|助手)$/ })).toBeVisible();
    const wasDark = await page.locator('body').getAttribute('arco-theme');
    const wasGlass = (await page.locator('html').getAttribute('data-surface')) === 'glass';
    const rail = page.locator('[data-glass-region="rail"]');
    const chooseAppearance = async (name: RegExp) => {
      await rail.getByRole('button', { name: /Background appearance|背景外观/i }).click();
      await page.getByRole('menuitemradio', { name }).click();
    };
    if (wasDark !== 'dark' || wasGlass) {
      await chooseAppearance(/^(Black|黑色)$/);
      await expect(page.locator('body')).toHaveAttribute('arco-theme', 'dark');
    }
    try {
      // Theme attributes change before the existing color transitions finish.
      // Await their actual completion so screenshots capture the settled palette.
      await page.evaluate(async () => {
        const transitions = document.getAnimations().filter((animation) => animation instanceof CSSTransition);
        await Promise.all(transitions.map((animation) => animation.finished.catch(() => undefined)));
      });
      await takeScreenshot(page, 'foundry-dark-assistants');
    } finally {
      if (wasDark !== 'dark' || wasGlass) {
        await chooseAppearance(wasGlass ? /^(Frosted glass|磨砂玻璃)$/ : /^(White|白色)$/);
        await expect(page.locator('html')).toHaveAttribute('data-surface', wasGlass ? 'glass' : 'solid');
      }
    }
  });
});

// ── Cross-page navigation ────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test('can navigate between pages via URL', async ({ page }) => {
    await goToGuid(page);
    expect(page.url()).toContain('guid');

    await goToSettings(page, 'about');
    expect(page.url()).toContain('about');

    await goToGuid(page);
    expect(page.url()).toContain('guid');
  });
});
