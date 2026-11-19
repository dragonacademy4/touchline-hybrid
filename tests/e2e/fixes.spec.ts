import { expect, mockFirebase, startDemo, startSession, test } from './fixtures';

test('Escape on a note sheet keeps the latest edits', async ({ page }) => {
  await mockFirebase(page);
  await startDemo(page);
  await startSession(page);
  await page.getByRole('button', { name: /^Kai:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Kai' });
  await dialog.getByRole('button', { name: 'Brave', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Anything else?' }).fill('Kai led the warm-up');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Kai: 2 notes/ })).toBeVisible();
});

test("a child's name never goes into the page title", async ({ page }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/player/demo-p1');
  await expect(page.getByRole('heading', { name: 'Ollie' })).toBeVisible();
  expect(await page.title()).toBe('Player · Touchline');
});

test('a malformed link does not crash the app', async ({ page, consoleErrors }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/session/%E0%A4%A');
  await expect(page.getByRole('heading', { name: 'Session not found' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('backup is off by default and can be chosen on the first screen', async ({ page }) => {
  await mockFirebase(page);
  await page.goto('/');
  const sw = page.getByRole('switch', { name: /Back up anonymised sessions/ });
  await expect(sw).not.toBeChecked();
  await sw.check();
  await page.getByRole('button', { name: 'Try the demo squad' }).click();
  await expect(page.getByText(/of 12 players/)).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('switch', { name: /Back up anonymised sessions/ })).toBeChecked();
});

test('delete everything refuses offline when backups exist, and deletes nothing', async ({ page, context }) => {
  await mockFirebase(page);
  await page.goto('/');
  await page.getByRole('switch', { name: /Back up anonymised sessions/ }).check();
  await page.getByRole('button', { name: 'Try the demo squad' }).click();
  await expect(page.getByText(/of 12 players/)).toBeVisible();
  await page.goto('/#/settings');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(/You're offline, so the anonymised backup can't be deleted yet. Nothing has been deleted./)).toBeVisible();
  await context.setOffline(false);
  await page.goto('/#/squad');
  await expect(page.getByRole('link', { name: /Ollie/ })).toBeVisible();
});

test('with backup off, delete everything works offline', async ({ page, context }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/settings');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try the demo squad' })).toBeVisible();
  await context.setOffline(false);
});
