import { expect, test } from '@playwright/test';

const adminToken = process.env.E2E_ADMIN_TOKEN ?? 'playwright-local-admin-token';

test('operator route advisory reaches a fan route and refreshes it automatically', async ({ browser }) => {
  const fanContext = await browser.newContext();
  const operatorContext = await browser.newContext();
  const fan = await fanContext.newPage();
  const operator = await operatorContext.newPage();

  try {
    await fan.goto('/navigate');
    await expect(fan.getByRole('heading', { name: 'MetLife Stadium navigation' })).toBeVisible();
    await expect(fan.getByText('Section 144', { exact: true }).last()).toBeVisible();
    await expect(fan.getByText('to Section 108', { exact: true })).toBeVisible();

    await operator.goto('/admin');
    const passcode = operator.getByLabel('Admin passcode');
    await passcode.fill('not-the-demo-token');
    await operator.getByRole('button', { name: 'Authenticate' }).click();
    await expect(operator.getByRole('alert')).toHaveText('Invalid passcode.');

    await passcode.fill(adminToken);
    await operator.getByRole('button', { name: 'Authenticate' }).click();
    await expect(operator.getByText('TOURNAMENT OPS')).toBeVisible();

    await operator.getByRole('button', { name: 'Enable guided demo' }).click();
    await expect(operator.getByRole('status')).toHaveText('Demo mode enabled. Simulation clock pinned to minute 40.');
    await expect(operator.getByRole('button', { name: 'Restore live simulation' })).toBeVisible();

    const advisoryResponse = operator.waitForResponse((response) =>
      response.url().includes('/api/admin/incident') && response.request().method() === 'POST',
    );
    const rerouteResponse = fan.waitForResponse((response) =>
      response.url().includes('/api/navigation/route') && response.request().method() === 'POST',
    );
    await operator.getByRole('button', { name: 'Trigger 100 Concourse route advisory' }).click();
    await expect((await advisoryResponse).ok()).toBe(true);
    await expect((await rerouteResponse).ok()).toBe(true);

    await expect(fan.getByRole('heading', { name: '100 Concourse route advisory' })).toBeVisible();
    await expect(fan.getByRole('status')).toHaveText(
      'Route refreshed after the 100 concourse route advisory advisory.',
    );
    await expect(fan.getByRole('button', { name: 'Re-plan Route' })).toBeVisible();
  } finally {
    await Promise.all([fanContext.close(), operatorContext.close()]);
  }
});
