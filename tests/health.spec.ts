import { expect, test } from '@playwright/test';

test('shows the backend and database status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Archimesh' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'Service ok · Database connected',
    {
      timeout: 15_000,
    },
  );
});

test('shows when the backend is unavailable', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Service unavailable');
});
