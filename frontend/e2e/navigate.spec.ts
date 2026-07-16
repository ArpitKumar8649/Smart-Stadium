import { expect, test } from '@playwright/test';

test('navigation loads the default route and exposes accessible route controls', async ({ page }) => {
  await page.goto('/navigate');

  await expect(page.getByRole('heading', { name: 'MetLife Stadium navigation' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'From' })).toHaveValue('Section 144');
  await expect(page.getByRole('textbox', { name: 'To' })).toHaveValue('Section 108');
  await expect(page.getByText('Section 144', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('to Section 108', { exact: true })).toBeVisible();

  const preference = page.getByRole('combobox', { name: 'Preference' });
  await preference.selectOption('step_free');
  await expect(preference).toHaveValue('step_free');
  await expect(page.getByText('Route updated for your step-free preference.')).toBeVisible();

  await page.getByRole('button', { name: 'Plan route' }).focus();
  await expect(page.getByRole('button', { name: 'Plan route' })).toBeFocused();
});
