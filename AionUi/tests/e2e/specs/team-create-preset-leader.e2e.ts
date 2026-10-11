/**
 * Team Create — Phase 2 assistant-only leader selection.
 *
 * Verifies that the Team create flow consumes assistant rows directly instead
 * of a mixed agent/preset dropdown, and that the created leader persists
 * assistant identity.
 */
import { test, expect } from '../fixtures';
import { httpDelete, httpGet, httpInvoke, httpPost, invokeBridge, navigateTo } from '../helpers';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';

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

  test('cancels an unconfigured product preset and opens the folder dialog on every workspace click', async ({
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
      const apiForm = page.locator('.assistant-api-setup-modal:visible');
      await expect(apiForm).toBeVisible();
      await apiForm.locator('button[aria-label="Close"]').click();
      await expect(modal).toBeVisible();
      await expect(modal.locator('[data-testid^="team-create-member-draft-"]')).toHaveCount(0);
      await expect(modal.locator('[data-leader-state="active"]')).toHaveCount(0);
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

type ProductRole = {
  id: string;
  name: string;
  name_i18n: Record<string, string>;
  enabled: boolean;
};

async function getProductRoles(page: Page): Promise<ProductRole[]> {
  const assistants = await invokeBridge<ProductRole[]>(page, 'assistants.list');
  return ['aionui-assistant', 'foundry-prd', 'foundry-development'].map((id) => {
    const role = assistants.find((assistant) => assistant.id === id || assistant.id === `preset-${id}`);
    expect(role, `${id} is available in the isolated profile`).toBeTruthy();
    expect(role!.name_i18n['zh-CN'], `${id} has a localized Chinese name`).toBeTruthy();
    return role!;
  });
}

async function readProviderCount(page: Page): Promise<number> {
  // Return only the count: never expose provider credential payloads to test output.
  return page.evaluate(async () => {
    const port = (window as unknown as { __backendPort: number }).__backendPort;
    const response = await fetch(`http://127.0.0.1:${port}/api/providers`);
    if (!response.ok) throw new Error(`Provider catalog request failed (${response.status})`);
    const result = (await response.json()) as { data: unknown[] };
    return result.data.length;
  });
}

async function blockRuntimeStarts(page: Page) {
  const attempted: string[] = [];
  const pattern = /\/api\/(?:conversations|teams)(?:\/|\?|$)/;
  const handler = async (route: Route) => {
    if (route.request().method() === 'POST') {
      attempted.push(new URL(route.request().url()).pathname);
      // A broken preflight must fail this assertion without creating a session
      // or sending a real model request during the regression test.
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  };
  await page.route(pattern, handler);
  return { attempted, dispose: () => page.unroute(pattern, handler) };
}

async function waitForFiniteMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const transitions = document
      .getAnimations()
      .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
    await Promise.all(transitions.map((animation) => animation.finished.catch(() => undefined)));
  });
}

test.describe('Foundry connection onboarding', () => {
  test.beforeEach(async ({ page, electronApp }) => {
    const profile = await electronApp.evaluate(({ app }) => ({
      mode: process.env.AIONUI_E2E_TEST,
      sandbox: process.env.AIONUI_E2E_USER_DATA_DIR,
      userData: app.getPath('userData'),
    }));
    expect(profile.mode).toBe('1');
    expect(profile.sandbox).toBeTruthy();
    expect(path.resolve(profile.userData)).toBe(path.resolve(profile.sandbox!));
    expect(await readProviderCount(page)).toBe(0);
    await waitForFiniteMotion(page);

    const previousApiForm = page.locator('.assistant-api-setup-modal:visible');
    if (await previousApiForm.isVisible()) {
      await previousApiForm.locator('button[aria-label="Close"]').click();
      await expect(previousApiForm).toBeHidden();
    }

    // The product-team folder regression shares this window and leaves its
    // create dialog open. Close through the UI without altering persisted data.
    const previousTeamDialog = page.locator('.team-create-modal:visible');
    if (await previousTeamDialog.isVisible()) {
      await previousTeamDialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(previousTeamDialog).toBeHidden();
    }
  });

  test('requires API setup before selecting a product role and preserves the draft and native CLI selection on cancel', async ({
    page,
  }, testInfo) => {
    const [target] = await getProductRoles(page);
    const starts = await blockRuntimeStarts(page);
    try {
      await navigateTo(page, '#/guid');
      const selected = page.locator('[data-assistant-id][aria-pressed="true"]');
      await expect(selected).toHaveCount(0);
      const draft = 'Foundry onboarding draft: build an iterative PRD for my product.';
      const input = page.getByTestId('guid-input');
      const search = page.getByRole('textbox', { name: /Search assistants|搜索助手/i });
      await input.fill(draft);
      await expect(page.getByTestId('guid-send-btn')).toBeDisabled();
      await search.fill(target.name_i18n['zh-CN']);
      await page.locator(`[data-assistant-id="${target.id}"]`).click();
      const apiForm = page.locator('.assistant-api-setup-modal:visible');
      await expect(apiForm).toBeVisible();
      await expect(apiForm).toContainText(target.name_i18n['zh-CN']);
      await expect(apiForm.getByText('DeepSeek', { exact: true })).toBeVisible();
      await expect(apiForm.getByTestId('provider-api-endpoint')).toHaveValue('https://api.deepseek.com/v1');
      await expect(apiForm.locator('#api_key_input')).toHaveValue('');
      await expect(selected).toHaveCount(0);
      expect(starts.attempted).toEqual([]);
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-api-form-on-selection.png') });
      await apiForm.locator('button[aria-label="Close"]').click();
      await expect(apiForm).toBeHidden();
      await expect(selected).toHaveCount(0);
      await expect(page.locator(`[data-assistant-id="${target.id}"]`)).toHaveAttribute('aria-pressed', 'false');
      await expect(input).toHaveValue(draft);
      await expect(page.getByTestId('guid-send-btn')).toBeDisabled();
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-api-cancelled-with-draft.png') });

      // Use a discovered native CLI without starting its runtime or requiring an API provider.
      const assistants = await invokeBridge<
        (Omit<ProductRole, 'name_i18n'> & {
          name_i18n?: Record<string, string>;
          agent?: { type: string };
          agent_status: string;
        })[]
      >(page, 'assistants.list');
      const native = assistants.find(
        (assistant) =>
          assistant.enabled &&
          assistant.agent?.type === 'acp' &&
          ['online', 'unchecked'].includes(assistant.agent_status)
      );
      expect(native, 'The isolated test environment exposes a selectable native CLI assistant').toBeTruthy();
      await search.fill(native!.name_i18n?.['zh-CN'] || native!.name);
      await page.locator(`[data-assistant-id="${native!.id}"]`).click();
      await expect(selected).toHaveAttribute('data-assistant-id', native!.id);
      await expect(apiForm).toBeHidden();
      await expect(page.getByTestId('assistant-connection-dialog')).toBeHidden();
      await expect(page.getByTestId('guid-send-btn')).toBeEnabled();
      await expect(input).toHaveValue(draft);
      await search.fill('');

      // Cancelling a different API role keeps the already selected CLI and draft.
      await search.fill(target.name_i18n['zh-CN']);
      await page.locator(`[data-assistant-id="${target.id}"]`).click();
      await expect(apiForm).toBeVisible();
      await apiForm.getByRole('button', { name: /^(Cancel|取消)$/i }).click();
      await expect(apiForm).toBeHidden();
      await search.fill('');
      await expect(selected).toHaveAttribute('data-assistant-id', native!.id);
      await expect(input).toHaveValue(draft);
      await expect(page.getByTestId('guid-send-btn')).toBeEnabled();
      expect(starts.attempted).toEqual([]);
      expect(await readProviderCount(page)).toBe(0);
      expect(new URL(page.url()).hash).toBe('#/guid');
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-native-cli-selection-preserved.png') });
    } finally {
      await starts.dispose();
    }
  });

  test('does not add members when an empty API form is closed or cancelled', async ({ page }, testInfo) => {
    const roles = await getProductRoles(page);
    const starts = await blockRuntimeStarts(page);
    try {
      await navigateTo(page, '#/team');
      const beforeTeams = await invokeBridge<{ id: string }[]>(page, 'team.list', { user_id: 'system_default_user' });
      await page.getByTestId('team-create-btn').first().click();
      const teamDialog = page.locator('.team-create-modal:visible');
      const name = `Foundry missing API team ${Date.now()}`;
      await teamDialog.getByTestId('team-create-name-input').fill(name);
      await teamDialog.getByTestId('team-create-product-preset').click();
      const apiForm = page.locator('.assistant-api-setup-modal:visible');
      await expect(apiForm).toBeVisible();
      await Promise.all(roles.map((role) => expect(apiForm).toContainText(role.name_i18n['zh-CN'])));
      await expect(teamDialog).toBeHidden();
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-team-api-on-selection.png') });
      await apiForm.locator('button[aria-label="Close"]').click();
      await expect(teamDialog).toBeVisible();
      const members = teamDialog.locator('[data-testid^="team-create-member-draft-"]');
      await expect(members).toHaveCount(0);
      await expect(teamDialog.locator('[data-leader-state="active"]')).toHaveCount(0);
      await expect(teamDialog.getByTestId('team-create-name-input')).toHaveValue(name);
      const confirm = teamDialog.getByRole('button', { name: /Confirm Create|Create Team|确认创建|创建团队/i });
      await expect(confirm).toBeDisabled();

      const [manager] = roles;
      await teamDialog.getByTestId(`team-create-agent-option-${manager.id}`).click();
      await expect(apiForm).toBeVisible();
      await expect(apiForm.locator('#api_key_input')).toHaveValue('');
      await apiForm.getByRole('button', { name: /^(Confirm|确认|确定)$/i }).click();
      await expect(apiForm.locator('.arco-form-item-error')).toBeVisible();
      await expect(apiForm).toBeVisible();
      await apiForm.getByRole('button', { name: /^(Cancel|取消)$/i }).click();
      await expect(teamDialog).toBeVisible();
      await expect(members).toHaveCount(0);
      await expect(confirm).toBeDisabled();
      await expect(teamDialog.getByTestId('team-create-name-input')).toHaveValue(name);
      expect(
        (await invokeBridge<{ id: string }[]>(page, 'team.list', { user_id: 'system_default_user' })).map(
          (team) => team.id
        )
      ).toEqual(beforeTeams.map((team) => team.id));
      expect(starts.attempted).toEqual([]);
      expect(await readProviderCount(page)).toBe(0);
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-team-cancelled-selection.png') });
      await teamDialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(teamDialog).toBeHidden();
    } finally {
      await starts.dispose();
    }
  });

  test('saves DeepSeek, chats from the home page and compares local models across completion, stop and resend', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const requests: { path: string; model: string; authorized: boolean }[] = [];
    const receivedPrompts: { model: string; prompt: string }[] = [];
    const fakeKey = 'foundry-e2e-not-a-real-api-key';
    const models = ['deepseek-flash', 'foundry-synthetic-chat'];
    let holdStreams = false;
    const heldResponses = new Set<http.ServerResponse>();
    // Keep all API traffic local and all credentials synthetic. This exercises
    // the packaged backend's transport without a live model account or native CLI.
    const server = http.createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v1/models') {
        response.end(JSON.stringify({ object: 'list', data: models.map((id) => ({ id, object: 'model' })) }));
        return;
      }
      if (request.url !== '/v1/chat/completions') {
        response.writeHead(404);
        response.end(JSON.stringify({ error: { message: 'Unsupported test endpoint' } }));
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      const payload = JSON.parse(body) as {
        model: string;
        stream?: boolean;
        messages?: { role: string; content: unknown }[];
      };
      const userPrompt = payload.messages?.findLast((message) => message.role === 'user')?.content;
      if (typeof userPrompt === 'string') receivedPrompts.push({ model: payload.model, prompt: userPrompt });
      requests.push({
        path: request.url,
        model: payload.model,
        authorized: request.headers.authorization === `Bearer ${fakeKey}`,
      });
      if (payload.stream) {
        response.setHeader('Content-Type', 'text/event-stream');
        const frame = (content: string, finishReason: string | null): string =>
          `data: ${JSON.stringify({
            id: 'foundry-e2e-completion',
            object: 'chat.completion.chunk',
            created: 1,
            model: payload.model,
            choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: finishReason }],
          })}\n\n`;
        const roundMarker =
          typeof userPrompt === 'string' && userPrompt.startsWith('Foundry synthetic comparison:')
            ? ` ${userPrompt}`
            : '';
        response.write(frame(`Foundry synthetic response for ${payload.model}.${roundMarker}`, null));
        if (holdStreams) {
          heldResponses.add(response);
          const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 250);
          response.once('close', () => {
            clearInterval(heartbeat);
            heldResponses.delete(response);
          });
          return;
        }
        response.end(`${frame('', 'stop')}data: [DONE]\n\n`);
      } else {
        response.end(
          JSON.stringify({
            id: 'foundry-e2e-completion',
            object: 'chat.completion',
            created: 1,
            model: payload.model,
            choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })
        );
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Local test server did not acquire a port');
    const starts = await blockRuntimeStarts(page);
    let providerId: string | undefined;
    let conversationId: string | undefined;
    let conversationGuard: ((route: Route) => Promise<void>) | undefined;
    const conversationPattern = /\/api\/conversations(?:\/|\?|$)/;
    try {
      const [manager] = await getProductRoles(page);
      await navigateTo(page, '#/team');
      await page.getByTestId('team-create-btn').first().click();
      const teamDialog = page.locator('.team-create-modal:visible');
      await teamDialog.getByTestId(`team-create-agent-option-${manager.id}`).click();
      const apiForm = page.locator('.assistant-api-setup-modal:visible');
      await expect(apiForm).toBeVisible();
      await expect(apiForm.getByTestId('provider-api-endpoint')).toHaveValue('https://api.deepseek.com/v1');
      await apiForm.getByTestId('provider-api-endpoint').fill(`http://127.0.0.1:${address.port}/v1`);
      await apiForm.locator('#api_key_input').fill(fakeKey);
      await apiForm.getByRole('button', { name: /^(Confirm|确认|确定)$/i }).click();
      await expect(apiForm).toBeHidden();
      await expect(teamDialog).toBeVisible();
      await expect(teamDialog.locator('[data-testid^="team-create-member-draft-"]')).toHaveCount(1);
      await expect(teamDialog.locator('[data-leader-state="active"]')).toHaveCount(1);
      await teamDialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(teamDialog).toBeHidden();
      // Expose only non-secret provider fields to the test runner.
      const providers = await page.evaluate(async () => {
        const port = (window as unknown as { __backendPort: number }).__backendPort;
        const response = await fetch(`http://127.0.0.1:${port}/api/providers`);
        const result = (await response.json()) as {
          data: {
            id: string;
            name: string;
            base_url: string;
            models: string[];
            model_settings: Record<string, { openai_api_mode?: string }>;
          }[];
        };
        return result.data.map(({ id, name, base_url, models: providerModels, model_settings }) => ({
          id,
          name,
          base_url,
          models: providerModels,
          model_settings,
        }));
      });
      expect(providers).toHaveLength(1);
      providerId = providers[0].id;
      expect(providers[0].name).toBe('DeepSeek');
      expect(providers[0].base_url).toBe(`http://127.0.0.1:${address.port}/v1`);
      expect(providers[0].models).toEqual(['deepseek-flash']);
      expect(providers[0].model_settings['deepseek-flash'].openai_api_mode).toBe('chat_completions');
      const health = await httpPost<{ status: string; error_kind?: string }>(
        page,
        '/api/agents/provider-health-check',
        { provider_id: providerId, model: 'deepseek-flash' }
      );
      expect(health.status, health.error_kind).toBe('healthy');
      expect(requests).toContainEqual({ path: '/v1/chat/completions', model: 'deepseek-flash', authorized: true });

      await navigateTo(page, '#/guid');
      await page.locator(`[data-assistant-id="${manager.id}"]`).click();
      await expect(page.locator(`[data-assistant-id="${manager.id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('assistant-connection-setup')).toBeHidden();
      await expect(apiForm).toBeHidden();
      expect(starts.attempted).toEqual([]);

      const detail = await invokeBridge<{ engine: { agent?: { type: string } } }>(page, 'assistants.get', {
        id: manager.id,
      });
      expect(detail.engine.agent?.type).toBe('aionrs');
      await starts.dispose();
      // Only the verified in-process assistant and synthetic provider can create a chat.
      conversationGuard = async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/conversations') {
          const body = route.request().postDataJSON() as {
            assistant?: { id?: string };
            model?: { provider_id?: string };
          };
          if (body.assistant?.id !== manager.id || body.model?.provider_id !== providerId) {
            starts.attempted.push(pathname);
            await route.abort('blockedbyclient');
            return;
          }
          const response = await route.fetch();
          if (response.ok()) {
            const envelope = (await response.json()) as { data: { id: string } };
            conversationId = envelope.data.id;
          }
          await route.fulfill({ response });
          return;
        }
        if (conversationId && pathname.startsWith(`/api/conversations/${conversationId}/`)) return route.continue();
        starts.attempted.push(pathname);
        await route.abort('blockedbyclient');
      };
      await page.route(conversationPattern, conversationGuard);
      const chatPrompt = 'Foundry synthetic chat: confirm this message reached the model.';
      await page.getByTestId('guid-input').fill(chatPrompt);
      await page.getByTestId('guid-send-btn').click();
      await page.waitForURL(/#\/conversation\//, { timeout: 30_000 });
      await expect(page.getByTestId('message-text-right').filter({ hasText: chatPrompt })).toBeVisible();
      await expect(
        page.getByTestId('message-text-left').filter({ hasText: 'Foundry synthetic response for deepseek-flash.' })
      ).toBeVisible({ timeout: 30_000 });
      expect(conversationId).toBeTruthy();
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-local-chat-response.png') });

      await httpInvoke(page, 'PUT', `/api/providers/${encodeURIComponent(providerId)}`, {
        models,
        model_settings: Object.fromEntries(models.map((model) => [model, { openai_api_mode: 'chat_completions' }])),
      });
      const benchModels = await httpGet<{ provider_id: string; model: string }[]>(page, '/api/model-bench/models');
      expect(benchModels.map(({ provider_id, model }) => [provider_id, model])).toEqual(
        models.map((model) => [providerId, model])
      );
      await navigateTo(page, '#/model-bench');
      const selector = page.locator('#bench-models');
      await selector.click();
      await page
        .getByRole('option', { name: 'deepseek-flash · DeepSeek', exact: true })
        .locator('.arco-select-option')
        .click();
      await page
        .getByRole('option', { name: 'foundry-synthetic-chat · DeepSeek', exact: true })
        .locator('.arco-select-option')
        .click();
      await page.keyboard.press('Escape');
      const prompt = page.locator('#bench-prompt');
      await prompt.click();
      const firstPrompt = 'Foundry synthetic comparison: return your model identity.';
      await prompt.fill(firstPrompt);
      const send = page.getByRole('button', { name: /^(同时发送|Send to all)$/i });
      await send.click();
      const lanes = models.map((model) => page.getByRole('region', { name: `${model} · DeepSeek`, exact: true }));
      await Promise.all(
        lanes.map((lane, index) => expect(lane).toContainText(`Foundry synthetic response for ${models[index]}.`))
      );
      await Promise.all(lanes.map((lane) => expect(lane.getByRole('status')).toHaveText(/已完成|Completed/i)));
      expect(
        receivedPrompts
          .filter((entry) => entry.prompt === firstPrompt)
          .map((entry) => entry.model)
          .toSorted()
      ).toEqual(models.toSorted());

      holdStreams = true;
      await prompt.fill('Foundry synthetic comparison: hold both streams until stopped.');
      await send.click();
      await expect.poll(() => heldResponses.size).toBe(2);
      await Promise.all(lanes.map((lane) => expect(lane.getByRole('status')).toHaveText(/生成中|Generating/i)));
      await page.getByRole('button', { name: /^(全部停止|Stop all)$/i }).click();
      await Promise.all(lanes.map((lane) => expect(lane.getByRole('status')).toHaveText(/已停止|Stopped/i)));
      await expect.poll(() => heldResponses.size).toBe(0);
      await expect(send).toBeEnabled();

      holdStreams = false;
      const resendPrompt = 'Foundry synthetic comparison: send again after stopping.';
      await prompt.fill(resendPrompt);
      await send.click();
      await expect.poll(() => receivedPrompts.filter((entry) => entry.prompt === resendPrompt).length).toBe(2);
      await Promise.all(lanes.map((lane) => expect(lane.getByRole('status')).toHaveText(/已完成|Completed/i)));
      await Promise.all(
        lanes.map((lane, index) => expect(lane).toContainText(`Foundry synthetic response for ${models[index]}.`))
      );
      await Promise.all(lanes.map((lane) => expect(lane).toContainText(resendPrompt)));
      expect(starts.attempted).toEqual([]);
      expect(requests.every((request) => request.authorized && models.includes(request.model))).toBe(true);
      await waitForFiniteMotion(page);
      await page.screenshot({ path: testInfo.outputPath('foundry-local-model-comparison-resend.png') });
    } finally {
      try {
        try {
          if (conversationId) {
            await navigateTo(page, '#/guid');
            await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`);
          }
        } finally {
          if (providerId) await httpDelete(page, `/api/providers/${encodeURIComponent(providerId)}`);
        }
      } finally {
        if (conversationGuard) await page.unroute(conversationPattern, conversationGuard);
        await starts.dispose();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    }
  });
});
