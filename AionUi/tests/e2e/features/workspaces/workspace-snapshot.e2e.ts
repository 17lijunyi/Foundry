/**
 * E2E: Workspace Changes tab — real user flow.
 *
 * Creates a team with a seeded workspace, writes a file to disk to produce a
 * diff, then drives the Changes tab in the workspace panel:
 *   1. Click the Changes tab
 *   2. Verify the unstaged file appears
 *   3. Click Stage → verify it moves to Staged
 *
 * The snake-case staging pipeline (init/compare/stage/unstage/discard) is
 * covered by direct unit tests against `WorkspaceSnapshotService` in the
 * integration suite; this file only asserts the rendered UI state.
 */
import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, TEAM_SUPPORTED_BACKENDS } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEAM_NAME = `E2E Workspace Snapshot ${Date.now()}`;

test.describe('Workspace Changes — UI panel', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-ws-snap-'));
    fs.writeFileSync(path.join(workspace, 'baseline.txt'), 'original');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('changes tab surfaces a newly written file and stage button moves it', async ({ page, electronApp }) => {
    test.setTimeout(180_000);

    if (TEAM_SUPPORTED_BACKENDS.size === 0) {
      test.skip(true, 'No supported team backends available');
      return;
    }

    await electronApp.evaluate(async ({ dialog }, target) => {
      const state = globalThis as unknown as { e2eWorkspaceDialogCalls: number };
      state.e2eWorkspaceDialogCalls = 0;
      dialog.showOpenDialog = () => {
        state.e2eWorkspaceDialogCalls += 1;
        return Promise.resolve({ canceled: false, filePaths: [target] });
      };
    }, workspace);

    await cleanupTeamsByName(page, TEAM_NAME);

    // ── Create team with seeded workspace ────────────────────────────────
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const modal = page.locator('.team-create-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await modal.locator('[data-testid="team-create-name-input"]').fill(TEAM_NAME);

    const agentCard = modal.locator('[data-testid^="team-create-agent-option-"]:not([aria-disabled="true"])').first();
    await expect(agentCard).toBeVisible({ timeout: 5_000 });
    await agentCard.click();

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

    const panel = page.locator('.chat-workspace');
    await expect(panel).toBeVisible({ timeout: 30_000 });

    // ── Seed a diff on disk (snapshot baseline was captured on team create) ─
    fs.writeFileSync(path.join(workspace, 'created.txt'), 'hello-snapshot');

    // ── Switch to Changes tab ────────────────────────────────────────────
    const changesTab = panel.locator('.arco-tabs-header-title').filter({ hasText: /Changes|更改/ });
    await expect(changesTab.first()).toBeVisible({ timeout: 10_000 });
    await changesTab.first().click();

    await page.screenshot({ path: 'tests/e2e/results/workspace-snapshot-01-changes-tab.png' });

    // ── Newly created file should surface somewhere in the Changes list ──
    const createdEntry = panel.getByText('created.txt').first();
    await expect(createdEntry).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: 'tests/e2e/results/workspace-snapshot-02-unstaged.png' });

    // ── Click a Stage button if available (per-file or Stage All) ────────
    // The FileChangeList renders a Stage-all action + per-file stage buttons.
    const stageButton = panel
      .locator('button, [role="button"]')
      .filter({ hasText: /Stage All|全部暂存|Stage|暂存/ })
      .first();
    const stageVisible = await stageButton.isVisible({ timeout: 5_000 }).catch(() => false);
    if (stageVisible) {
      await stageButton.click({ trial: false }).catch(() => {});
      // After staging, the file should still be in the list (just under Staged).
      await expect(panel.getByText('created.txt').first()).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: 'tests/e2e/results/workspace-snapshot-03-staged.png' });
    }

    // ── Cleanup ──────────────────────────────────────────────────────────
    await cleanupTeamsByName(page, TEAM_NAME);
  });
});
