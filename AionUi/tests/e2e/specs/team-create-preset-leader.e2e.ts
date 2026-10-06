/**
 * Team Create — Phase 2 assistant-only leader selection.
 *
 * Verifies that the Team create flow consumes assistant rows directly instead
 * of a mixed agent/preset dropdown, and that the created leader persists
 * assistant identity.
 */
import { test, expect } from '../fixtures';
import { invokeBridge, navigateTo } from '../helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type TTeamBackendAgent = {
  role: string;
  name: string;
  assistant_backend: string;
  assistant_id?: string;
  custom_agent_id?: string;
};

type TTeam = {
  id: string;
  name: string;
  assistants: TTeamBackendAgent[];
};

test.describe('Team Create - assistant leader', () => {
  test('can create a team with an assistant leader from the unified assistant list', async ({ page }) => {
    test.setTimeout(120_000);

    let createdTeamId: string | undefined;

    try {
      await navigateTo(page, '#/team');
      const createBtn = page.locator('[data-testid="team-create-btn"]').first();
      await expect(createBtn).toBeVisible({ timeout: 10_000 });
      await createBtn.click();

      const modal = page.locator('.team-create-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      await expect(modal.locator('[data-testid="team-create-leader-select"]')).toHaveCount(0);

      const leaderOptions = modal.locator('[data-testid^="team-create-agent-option-"]');
      await expect(leaderOptions.first()).toBeVisible({ timeout: 10_000 });

      const optionCount = await leaderOptions.count();
      let targetOption;
      for (let index = 0; index < optionCount; index += 1) {
        const candidate = leaderOptions.nth(index);
        const classes = (await candidate.getAttribute('class')) || '';
        if (!classes.includes('cursor-not-allowed')) {
          targetOption = candidate;
          break;
        }
      }

      if (!targetOption) {
        test.skip(true, 'No selectable assistants available in this environment');
        return;
      }

      const targetTestId = await targetOption.getAttribute('data-testid');
      expect(targetTestId).toBeTruthy();
      const expectedAssistantId = targetTestId!.replace('team-create-agent-option-', '');
      await targetOption.click();

      const teamName = `E2E Assistant Team ${Date.now()}`;
      await modal.locator('[data-testid="team-create-name-input"]').fill(teamName);

      const confirmBtn = modal.getByRole('button', { name: /create team|创建团队/i });
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
      await confirmBtn.click();

      await expect(modal).toBeHidden({ timeout: 15_000 });
      await page.waitForURL(/\/team\//, { timeout: 15_000 });

      createdTeamId = page.url().match(/team\/([^/?#]+)/)?.[1];
      expect(createdTeamId).toBeTruthy();

      const team = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(team).toBeTruthy();
      expect(team!.assistants.length).toBe(1);

      const leader = team!.assistants[0];
      expect(['lead', 'leader']).toContain(leader.role);
      expect(leader.assistant_id).toBe(expectedAssistantId);
      expect(leader.assistant_backend).toBeTruthy();
    } finally {
      if (createdTeamId) {
        await invokeBridge(page, 'team.remove', { id: createdTeamId }).catch(() => {});
        const deleted = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId }).catch(() => null);
        expect(deleted).toBeNull();
      }
    }
  });
});

test.describe('Foundry product defaults', () => {
  test('enables the three product roles and loads their working rules in a packaged app', async ({ page }) => {
    const assistants = await invokeBridge<{ id: string; enabled: boolean }[]>(page, 'assistants.list');
    await Promise.all(
      ['aionui-assistant', 'foundry-prd', 'foundry-development'].map(async (id) => {
        const row = assistants.find((assistant) => assistant.id === id || assistant.id === `preset-${id}`);
        expect(row, `${id} is present`).toBeTruthy();
        expect(row!.enabled).toBe(true);
        const detail = await invokeBridge<{ rules: { content: string } }>(page, 'assistants.get', {
          id: row!.id,
          locale: 'zh-CN',
        });
        expect(detail.rules.content).toContain('PRD');
      })
    );
  });

  test('selects the product team and opens the folder dialog on every workspace click', async ({
    page,
    electronApp,
  }, testInfo) => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-folder-picker-'));
    await electronApp.evaluate(({ dialog }, folder) => {
      const state = globalThis as unknown as {
        foundryDialogCalls: number;
        foundryOriginalDialog: typeof dialog.showOpenDialog;
      };
      state.foundryDialogCalls = 0;
      state.foundryOriginalDialog = dialog.showOpenDialog;
      Object.assign(dialog, {
        showOpenDialog: async () => {
          state.foundryDialogCalls += 1;
          return {
            canceled: state.foundryDialogCalls === 3,
            filePaths: state.foundryDialogCalls === 3 ? [] : [folder],
          };
        },
      });
    }, workspace);
    try {
      await navigateTo(page, '#/team');
      await page.locator('[data-testid="team-create-btn"]').first().click();
      const modal = page.locator('.team-create-modal');
      const preset = modal.locator('[data-testid="team-create-product-preset"]');
      await expect(preset).toBeEnabled();
      await preset.click();
      await expect(modal.locator('[data-testid^="team-create-member-draft-"]')).toHaveCount(3);
      await expect(modal.locator('[data-leader-state="active"]')).toHaveCount(1);
      const trigger = modal.locator('[data-testid="team-create-workspace-trigger"]');
      const openAndCheck = async (click: number) => {
        await trigger.click();
        await expect
          .poll(() =>
            electronApp.evaluate(() => (globalThis as unknown as { foundryDialogCalls: number }).foundryDialogCalls)
          )
          .toBe(click);
        await expect(trigger).toContainText(path.basename(workspace));
      };
      await openAndCheck(1);
      await openAndCheck(2);
      await openAndCheck(3);
      await expect(modal.locator('[data-testid="team-create-workspace-menu"]')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('foundry-product-team.png') });
    } finally {
      await electronApp.evaluate(({ dialog }) => {
        const state = globalThis as unknown as { foundryOriginalDialog: typeof dialog.showOpenDialog };
        Object.assign(dialog, { showOpenDialog: state.foundryOriginalDialog });
      });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
