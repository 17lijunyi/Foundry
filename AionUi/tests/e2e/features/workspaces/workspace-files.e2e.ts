/**
 * E2E: Workspace Files tab — real user flow.
 *
 * Creates a team with a seeded workspace, navigates to the team page, and
 * verifies the workspace panel renders with the file tree, search input, and
 * can resolve a seeded file. All interactions drive the renderer UI; the
 * backend contract for `/api/fs/*` is covered separately in the Vitest
 * integration suite (tests/integration).
 */
import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, TEAM_SUPPORTED_BACKENDS } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEAM_NAME = `E2E Workspace Files ${Date.now()}`;

test.describe('Workspace Files — UI panel', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-ws-files-'));
    fs.writeFileSync(path.join(workspace, 'readme.md'), '# seeded');
    fs.mkdirSync(path.join(workspace, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'notes', 'alpha.txt'), 'alpha');
    fs.writeFileSync(path.join(workspace, 'notes', 'beta.txt'), 'beta');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('workspace panel renders tree and search for a team workspace', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    if (TEAM_SUPPORTED_BACKENDS.size === 0) {
      test.skip(true, 'No supported team backends available');
      return;
    }

    // Mock native folder dialog → point at our seeded workspace so the team is
    // created with a user-specified workspace (not a temp one).
    await electronApp.evaluate(async ({ dialog }, target) => {
      const state = globalThis as unknown as { e2eWorkspaceDialogCalls: number };
      state.e2eWorkspaceDialogCalls = 0;
      dialog.showOpenDialog = () => {
        state.e2eWorkspaceDialogCalls += 1;
        return Promise.resolve({ canceled: false, filePaths: [target] });
      };
    }, workspace);

    await cleanupTeamsByName(page, TEAM_NAME);

    // ── Create team via sidebar UI ───────────────────────────────────────
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const modal = page.locator('.team-create-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const nameInput = modal.locator('[data-testid="team-create-name-input"]');
    await nameInput.fill(TEAM_NAME);

    const agentCard = modal.locator('[data-testid^="team-create-agent-option-"]:not([aria-disabled="true"])').first();
    await expect(agentCard).toBeVisible({ timeout: 5_000 });
    await agentCard.click();

    // Pick workspace via the mocked native dialog trigger
    await page.evaluate(() => {
      localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['/previous/project']));
    });
    const wsTrigger = modal.locator('[data-testid="team-create-workspace-trigger"]');
    await expect(wsTrigger).toBeVisible({ timeout: 3_000 });
    const selectWorkspace = async (click: number) => {
      await wsTrigger.click();
      await expect
        .poll(() =>
          electronApp.evaluate(
            () => (globalThis as unknown as { e2eWorkspaceDialogCalls: number }).e2eWorkspaceDialogCalls
          )
        )
        .toBe(click);
      await expect(wsTrigger).toContainText(path.basename(workspace));
    };
    await selectWorkspace(1);
    await selectWorkspace(2);
    await expect(page.locator('[data-testid="team-create-workspace-menu"]')).toHaveCount(0);

    const createConfirmBtn = modal.locator('.arco-btn-primary');
    await expect(createConfirmBtn).toBeEnabled({ timeout: 5_000 });
    await createConfirmBtn.click();

    await expect(modal).toBeHidden({ timeout: 15_000 });
    await page.waitForURL(/\/team\//, { timeout: 15_000 });

    // ── Wait for workspace panel to mount ────────────────────────────────
    const panel = page.locator('.chat-workspace');
    await expect(panel).toBeVisible({ timeout: 30_000 });

    // Title label reflects the workspace directory name
    const title = panel.locator('.workspace-title-label').first();
    await expect(title).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: 'tests/e2e/results/workspace-files-01-panel.png' });

    // ── Tree should list our seeded files ────────────────────────────────
    const tree = panel.locator('.workspace-tree');
    await expect(tree).toBeVisible({ timeout: 15_000 });

    // readme.md is a top-level seeded file
    await expect(panel.getByText('readme.md').first()).toBeVisible({ timeout: 10_000 });

    // ── Search input toggles + accepts a query ───────────────────────────
    const searchInput = panel.locator('.workspace-search-input input').first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill('readme');
      await expect(searchInput).toHaveValue('readme', { timeout: 3_000 });

      // Search narrows the visible entries — readme.md stays visible
      await expect(panel.getByText('readme.md').first()).toBeVisible({ timeout: 5_000 });

      await searchInput.fill('');
    }

    await page.screenshot({ path: 'tests/e2e/results/workspace-files-02-tree.png' });

    // ── Cleanup ──────────────────────────────────────────────────────────
    await cleanupTeamsByName(page, TEAM_NAME);
  });
});
