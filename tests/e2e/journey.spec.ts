import AxeBuilder from '@axe-core/playwright';
import { addNote, bodiesWithNames, expect, mockFirebase, startDemo, startSession, test, QA } from './fixtures';

const shotDir = `${QA}/e2e`;

test('main journey with the cloud fallback: capture, structure, card, parent update, progress', async ({ page, consoleErrors }, info) => {
  const w = info.project.name;
  const log = await mockFirebase(page, 'ok');
  await startDemo(page);
  await page.screenshot({ path: `${shotDir}/${w}-01-today.png`, fullPage: true });

  // Headless Chrome has the Prompt API but no Gemini Nano, so the app plans the cloud path.
  await expect(page.getByRole('link', { name: /AI: AI runs in the cloud with names hidden/ })).toBeVisible();

  await startSession(page);
  await addNote(page, 'Ollie', ['Brave', 'Weak foot'], 'Ollie scored with his left foot and helped Seren up after she fell');
  await addNote(page, 'Amara', ['Good passing']);
  await expect(page.getByText('2 of 12 noted')).toBeVisible();
  await page.screenshot({ path: `${shotDir}/${w}-02-capture.png`, fullPage: true });

  await page.getByRole('button', { name: 'Structure in the cloud' }).click();
  await expect(page.getByRole('img', { name: /Names hidden:.*Ollie becomes P01/ })).toBeVisible();
  await page.screenshot({ path: `${shotDir}/${w}-03-fold.png` });

  // Review: names restored locally, cloud badge, exact sent text visible.
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.locator('[data-source="in_cloud"]').first()).toBeVisible();
  await expect(page.getByText('Brilliant effort today, Ollie!')).toBeVisible();
  await expect(page.getByText('Amara showed real bravery on the ball.')).toBeVisible();
  await page.getByText('What the model saw').click();
  const peek = page.getByLabel('Exact text sent to the model');
  await expect(peek).toContainText('[P01] scored with his left foot and helped [P12] up');
  await expect(peek).not.toContainText('Ollie');
  await page.screenshot({ path: `${shotDir}/${w}-04-review.png`, fullPage: true });

  // The request that left the browser had no names in it.
  const aiCalls = log.requests.filter((r) => r.url.includes('firebasevertexai'));
  expect(aiCalls).toHaveLength(1);
  expect(aiCalls[0].body).toContain('"responseJsonSchema"');
  expect(bodiesWithNames(log)).toEqual([]);

  // Player card: renders and downloads a PNG.
  await page.getByRole('link', { name: 'Player card' }).first().click();
  await expect(page.getByRole('img', { name: /Player card for Amara/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toMatch(/^Amara-\d{4}-\d{2}-\d{2}\.png$/);
  await page.screenshot({ path: `${shotDir}/${w}-05-card.png`, fullPage: true });

  // Parent update (cloud only).
  await page.goto('/#/updates');
  await page.getByRole('button', { name: "Write this week's update" }).click();
  await expect(page.getByRole('heading', { name: 'A busy week for the group' })).toBeVisible();
  await expect(page.getByText(/Ollie:\s*Ollie was brave in the duels/)).toBeVisible();
  await page.getByText('What the cloud saw').first().click();
  await expect(page.getByLabel('Exact text sent to the cloud').first()).not.toContainText('Ollie');
  await page.screenshot({ path: `${shotDir}/${w}-06-update.png`, fullPage: true });

  // 4-week progress for Freya (3 demo sessions).
  await page.goto('/#/player/demo-p4');
  await page.getByRole('button', { name: 'Write a 4-week progress report' }).click();
  await expect(page.getByRole('heading', { name: 'Freya has grown in confidence over the month.' })).toBeVisible();
  await expect(page.getByText('Try at home: Ten minutes of left-foot passes against a wall.')).toBeVisible();
  await page.screenshot({ path: `${shotDir}/${w}-07-progress.png`, fullPage: true });

  expect(bodiesWithNames(log)).toEqual([]);
  const progressCall = log.requests.filter((r) => r.url.includes('firebasevertexai')).at(-1)!;
  expect(progressCall.body).toContain('Player: P04');

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

for (const path of ['/', '/#/squad', '/#/updates', '/#/settings', '/#/privacy', '/#/session/demo-s3/review', '/#/player/demo-p1']) {
  test(`accessibility (axe, WCAG 2.2 AA) on ${path}`, async ({ page, consoleErrors }) => {
    await mockFirebase(page);
    await startDemo(page);
    await page.goto(path);
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

test('welcome screen passes axe in dark mode too', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo squad' })).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Try the demo squad' }).click();
  await page.waitForTimeout(300);
  const r2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r2.violations.map((v) => v.id)).toEqual([]);
  await ctx.close();
});
