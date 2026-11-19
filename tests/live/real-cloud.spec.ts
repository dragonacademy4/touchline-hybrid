/**
 * Live test against the real Firebase AI Logic backend (no mocks). Needs an
 * App Check debug token registered in the Firebase console, passed in
 * TOUCHLINE_APPCHECK_DEBUG_TOKEN. Run: npm run e2e:live
 */
import { addNote, bodiesWithNames, expect, startDemo, startSession, test, QA } from '../e2e/fixtures';

const token = process.env.TOUCHLINE_APPCHECK_DEBUG_TOKEN;
// Against the deployed site, App Check uses real reCAPTCHA Enterprise instead of a debug token.
const site = process.env.TOUCHLINE_BASE_URL;
test.skip(!token && !site, 'Set TOUCHLINE_APPCHECK_DEBUG_TOKEN (local) or TOUCHLINE_BASE_URL (deployed site)');
if (site) test.use({ baseURL: site, serviceWorkers: 'allow' });

test('real cloud: structure a session, parent update and progress via Firebase AI Logic', async ({ page }, info) => {
  test.setTimeout(180_000);
  const log: Array<{ url: string; body: string; status?: number }> = [];
  page.on('request', (r) => { if (r.url().includes('googleapis.com')) log.push({ url: r.url(), body: r.postData() ?? '' }); });
  page.on('response', (r) => { const e = log.find((x) => x.url === r.url() && x.status === undefined); if (e) e.status = r.status(); });
  page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 300)}`));
  if (!site) await page.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token!);
  await startDemo(page);
  await startSession(page, 'Passing and receiving');
  await addNote(page, 'Ollie', ['Brave', 'Weak foot'], 'Ollie scored with his left foot and helped Seren up after she fell');
  await addNote(page, 'Amara', ['Good passing'], 'Amara switched play twice, lovely vision');
  await addNote(page, 'Kai', ['Took a knock'], 'Kai took a knock on his ankle, carried on');
  await page.getByRole('button', { name: 'Structure in the cloud' }).click();
  await expect(page).toHaveURL(/\/review$/, { timeout: 90_000 });
  await expect(page.locator('[data-source="in_cloud"]').first()).toBeVisible();
  await page.screenshot({ path: `${QA}/live/${site ? 'site-' : ''}${info.project.name}-review.png`, fullPage: true });
  const synced = await page.getByText('Anonymised copy synced (tokens only, no names).').waitFor({ timeout: 20_000 }).then(() => true, () => false);
  console.log('FIRESTORE SYNC:', synced ? 'confirmed by server' : 'not confirmed within 20 s');
  console.log('REVIEW TEXT:', (await page.locator('main').innerText()).slice(0, 1500));

  await page.goto('/#/updates');
  await page.getByRole('button', { name: "Write this week's update" }).click();
  await expect(page.locator('[data-source="in_cloud"]').first()).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${QA}/live/${site ? 'site-' : ''}${info.project.name}-update.png`, fullPage: true });

  await page.goto('/#/player/demo-p4');
  await page.getByRole('button', { name: 'Write a 4-week progress report' }).click();
  await expect(page.locator('article [data-source="in_cloud"]')).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${QA}/live/${site ? 'site-' : ''}${info.project.name}-progress.png`, fullPage: true });

  const ai = log.filter((r) => r.url.includes('firebasevertexai'));
  console.log('OTHER FIREBASE:', log.filter((r) => !r.url.includes('firebasevertexai')).map((r) => `${r.status} ${r.url.split('?')[0]}`).join('\n'));
  console.log('AI CALLS:', ai.map((r) => `${r.status} ${r.url}`).join('\n'));
  expect(ai.length).toBeGreaterThanOrEqual(3);
  const leaked = log.filter((r) => /\b(Ollie|Seren|Amara|Kai|Freya)\b/.test(r.body));
  expect(leaked.map((r) => r.url)).toEqual([]);
});
