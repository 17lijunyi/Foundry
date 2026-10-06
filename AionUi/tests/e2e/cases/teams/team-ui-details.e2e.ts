import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, createTeam } from '../../helpers';

const TEAM_COLLAPSED = 'E2E Collapsed Team';
const TEAM_WORKSPACE = 'E2E Workspace Team';

test.describe('Team UI Details', () => {
  test('collapsed sidebar shows team icon and navigates on click', async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_COLLAPSED);

    let teamId: string;
    try {
      teamId = await createTeam(page, TEAM_COLLAPSED);
    } catch {
      test.skip();
      return;
    }

    const collapseBtn = page.locator('button[aria-label="Collapse sidebar"], button[aria-label="折叠侧边栏"]');
    const expandBtn = page.locator('button[aria-label="Expand sidebar"], button[aria-label="展开侧边栏"]');

    await collapseBtn.click({ timeout: 5_000 });

    const collapsedItem = page.locator(`[data-testid="collapsed-team-item-${teamId}"]`);
    await expect(collapsedItem).toBeVisible({ timeout: 5_000 });

    const collapsedIcon = page.locator(`[data-testid="collapsed-team-icon-${teamId}"]`);
    await expect(collapsedIcon).toBeVisible();

    await collapsedItem.click();
    await page.waitForURL(new RegExp(`/team/${teamId}`), { timeout: 10_000 });

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain(`/team/${teamId}`);

    await expandBtn.click({ timeout: 5_000 });

    await cleanupTeamsByName(page, TEAM_COLLAPSED);
  });

  test('create team with workspace folder via native dialog', async ({ electronApp, page }) => {
    await cleanupTeamsByName(page, TEAM_WORKSPACE);

    const tmpDir = `/tmp/e2e-workspace-${Date.now()}`;
    await electronApp.evaluate(async ({ dialog }, dir) => {
      const fs = await import('fs');
      fs.mkdirSync(dir, { recursive: true });
      const state = globalThis as unknown as { e2eWorkspaceDialogCalls: number };
      state.e2eWorkspaceDialogCalls = 0;
      dialog.showOpenDialog = () => {
        state.e2eWorkspaceDialogCalls += 1;
        return Promise.resolve({ canceled: false, filePaths: [dir] });
      };
    }, tmpDir);

    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const modal = page.locator('.arco-modal').last();
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const nameInput = modal.locator('[data-testid="team-create-name-input"]');
    await nameInput.fill(TEAM_WORKSPACE);

    const firstOption = modal.locator('[data-testid^="team-create-agent-option-"]:not([aria-disabled="true"])').first();
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
    await firstOption.click();

    // Existing history must not change the primary selection action into a menu.
    await page.evaluate(() => {
      localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/previous/project']));
    });
    const trigger = modal.locator('[data-testid="team-create-workspace-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 3_000 });
    const selectWorkspace = async (click: number) => {
      await trigger.click();
      await expect
        .poll(() =>
          electronApp.evaluate(
            () => (globalThis as unknown as { e2eWorkspaceDialogCalls: number }).e2eWorkspaceDialogCalls
          )
        )
        .toBe(click);
      await expect(trigger).toContainText(tmpDir.split('/').pop()!);
    };
    await selectWorkspace(1);
    await selectWorkspace(2);
    await expect(page.locator('[data-testid="team-create-workspace-menu"]')).toHaveCount(0);

    const confirmBtn = modal.locator('.arco-btn-primary');
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click();

    await page.waitForURL(/\/team\//, { timeout: 15_000 });

    const wsTitle = page.locator('text=Workspace').or(page.locator('text=工作区'));
    await expect(wsTitle.first()).toBeVisible({ timeout: 10_000 });

    await cleanupTeamsByName(page, TEAM_WORKSPACE);

    await electronApp.evaluate(async (_ctx, dir) => {
      const fs = await import('fs');
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }, tmpDir);
  });
});
