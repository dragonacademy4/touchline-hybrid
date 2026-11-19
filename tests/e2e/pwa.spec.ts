import { expect, mockFirebase, startDemo, test } from './fixtures';

test.use({ serviceWorkers: 'allow' });

test('installable PWA: works after a reload with no network at all', async ({ page, context }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/of 12 players/)).toBeVisible();
  await page.goto('/#/squad');
  await expect(page.getByRole('link', { name: /Ollie/ })).toBeVisible();
  await context.setOffline(false);
});
