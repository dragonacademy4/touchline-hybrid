import { expect, mockFirebase, startDemo, test } from './fixtures';

test('own squad from scratch: empty states, add, validate, duplicate, edit, remove with undo', async ({ page, consoleErrors }, info) => {
  await mockFirebase(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with my own squad' }).click();
  await expect(page.getByRole('heading', { name: 'No players yet' })).toBeVisible();
  await page.screenshot({ path: `../qa/e2e/${info.project.name}-10-squad-empty.png`, fullPage: true });

  await page.getByRole('button', { name: 'Add a player' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a player' });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a name with at least 2 letters.');
  await dialog.getByRole('textbox', { name: 'First name' }).fill('Sam B');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a group, e.g. Under 9s.');
  await dialog.getByRole('textbox', { name: 'Nicknames (optional)' }).fill('Sam, Sammy, x');
  await dialog.getByRole('combobox', { name: 'Group' }).fill('Under 11s');
  await dialog.getByRole('button', { name: 'Save, add another' }).click();
  await expect(page.getByText('Sam B added.')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'First name' }).fill('sam b');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText("There's already a Sam B in Under 11s");
  await dialog.getByRole('textbox', { name: 'First name' }).fill('Sam K');
  await dialog.getByRole('textbox', { name: 'Nicknames (optional)' }).fill('Sam');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole('link', { name: /Sam B.*Also: Sam, Sammy.*P01/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sam K.*P02/ })).toBeVisible();
  await page.screenshot({ path: `../qa/e2e/${info.project.name}-11-squad.png`, fullPage: true });

  // Today now shows the hero for the new group.
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByText('0 of 2 players')).toBeVisible();

  // Edit then remove (no history: deleted), with undo restoring a player.
  await page.goto('/#/squad');
  await page.getByRole('link', { name: /Sam K/ }).click();
  await page.getByRole('button', { name: 'Edit Sam K' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Sam K deleted.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.goto('/#/squad');
  await expect(page.getByRole('link', { name: /Sam K/ })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('removing a player with history archives them; tokens are never reused', async ({ page }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/player/demo-p1');
  await page.getByRole('button', { name: 'Edit Ollie' }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Ollie removed. Their past notes are kept.')).toBeVisible();
  await page.goto('/#/squad');
  await page.getByText('Removed players (1)').click();
  await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByRole('textbox', { name: 'First name' }).fill('Ffion');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: /Ffion.*P13/ })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('link', { name: /Ollie.*P01/ })).toBeVisible();
});

test('data controls: export JSON and delete everything', async ({ page }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/settings');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export (JSON)' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^touchline-export-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8'));
  expect(json.players).toHaveLength(12);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Try the demo squad' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Try the demo squad' })).toBeVisible();
});

test('data survives a reload (IndexedDB) and the session can be deleted with undo', async ({ page }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.reload();
  await expect(page.getByText(/of 12 players/)).toBeVisible();
  await page.getByRole('button', { name: /Start today's session/ }).click();
  await page.getByRole('button', { name: 'Start capturing' }).click();
  await page.getByRole('button', { name: 'Edit session details' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Session deleted.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: /Training/ })).toBeVisible();
});

test('keyboard: sheet traps focus and Escape closes it', async ({ page }) => {
  await mockFirebase(page);
  await startDemo(page);
  await page.getByRole('button', { name: /Start today's session/ }).click();
  await expect(page.getByRole('textbox', { name: /Focus/ })).toBeFocused();
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  expect(inside).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
