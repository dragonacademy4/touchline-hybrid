/**
 * Test doubles for the network edges only. The app's own code and the real
 * Firebase SDK run unmodified:
 * - the Firebase AI Logic REST endpoint is answered with responses in the
 *   documented generateContent shape, built from the tokens in the prompt;
 * - for on-device tests, a fake `window.LanguageModel` (Chrome's Prompt API)
 *   is installed, so the SDK's real hybrid routing picks the on-device path.
 * Every request body is recorded so tests can assert no child's name left.
 */
import { test as base, expect, type Page, type Route } from '@playwright/test';

/** Where screenshots go. The project's own QA folder sets QA_DIR=../qa. */
export const QA = process.env.QA_DIR ?? 'test-results/qa';

export const DEMO_NAMES = ['Ollie', 'Oliver', 'Amara', 'Jayden', 'Freya', 'Kai', 'Isla', 'Rhys', 'Maisie', 'Theo', 'Nia', 'Alfie', 'Seren'];

/** Builds a model reply in the requested schema, using only tokens found in the prompt. */
export function fakeModelReply(prompt: string): string {
  const tokens = [...new Set([...prompt.matchAll(/^- (P\d{2,3}):/gm)].map((m) => m[1]))];
  if (prompt.includes('Notes per player')) {
    return JSON.stringify({
      players: tokens.map((t) => ({
        player: t,
        strength: `[${t}] showed real bravery on the ball.`,
        nextStep: `[${t}] should use the weaker foot more in warm-ups.`,
        praise: `Brilliant effort today, [${t}]!`,
      })),
      summary: 'A lively session. Most players tried the new passing pattern.',
      flags: [],
    });
  }
  if (prompt.includes('Week beginning')) {
    return JSON.stringify({
      title: 'A busy week for the group',
      message: 'This week we worked on defending as a team and the children were brilliant at pressing together.',
      players: tokens.map((t) => ({ player: t, line: `[${t}] was brave in the duels and is working on staying on their feet.` })),
    });
  }
  const t = /Player: (P\d{2,3})/.exec(prompt)?.[1] ?? 'P01';
  return JSON.stringify({
    headline: `[${t}] has grown in confidence over the month.`,
    progress: `Across these sessions [${t}] moved from tidy passing to braver defending.`,
    strengths: ['Interceptions', 'Close control'],
    focus: 'Use the left foot under pressure.',
    homeIdea: 'Ten minutes of left-foot passes against a wall.',
  });
}

export interface CloudLog {
  requests: Array<{ url: string; body: string }>;
}

export type CloudBehaviour = 'ok' | '429' | '500' | 'garbage' | 'hang';

export async function mockFirebase(page: Page, behaviour: CloudBehaviour | (() => CloudBehaviour) = 'ok'): Promise<CloudLog> {
  const log: CloudLog = { requests: [] };
  const record = (route: Route) => log.requests.push({ url: route.request().url(), body: route.request().postData() ?? '' });
  await page.route('**/firebasevertexai.googleapis.com/**', async (route) => {
    record(route);
    const b = typeof behaviour === 'function' ? behaviour() : behaviour;
    if (b === 'hang') return; // never answered
    if (b === '429') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }) });
    if (b === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 500, message: 'Internal error', status: 'INTERNAL' } }) });
    const body = JSON.parse(route.request().postData() ?? '{}');
    const prompt: string = body.contents?.[0]?.parts?.[0]?.text ?? '';
    const text = b === 'garbage' ? 'Sorry, I cannot help with that.' : fakeModelReply(prompt);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80, totalTokenCount: 180 } }),
    });
  });
  // Installations and Remote Config: documented response shapes (an installation, then "no template", so defaults apply).
  await page.route('**/firebaseinstallations.googleapis.com/**', async (route) => {
    record(route);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'projects/266196978860/installations/fakeFid', fid: 'cFakeFid00000000000000', refreshToken: 'r', authToken: { token: 'a', expiresIn: '604800s' } }),
    });
  });
  await page.route('**/firebaseremoteconfig.googleapis.com/**', async (route) => {
    record(route);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'NO_TEMPLATE' }) });
  });
  // Auth and Firestore (anonymised sync): record and fail fast, like a network edge. Sync is tested separately.
  await page.route(/https:\/\/(identitytoolkit|securetoken|firestore|content-firebaseappcheck|firebaselogging-pa)\.googleapis\.com\/.*/, async (route) => {
    record(route);
    return route.abort('connectionrefused');
  });
  return log;
}

/** Installs a fake Chrome Prompt API so the real Firebase SDK routes to "on-device". */
export async function fakeGeminiNano(page: Page, availability: 'available' | 'unavailable' | 'downloadable' = 'available') {
  await page.addInitScript(
    ({ availability, replySrc }) => {
      const reply = new Function(`return (${replySrc})`)() as (p: string) => string;
      const calls: Array<{ text: string; constraint: unknown }> = [];
      (window as unknown as { __nanoCalls: typeof calls }).__nanoCalls = calls;
      (window as unknown as { LanguageModel: unknown }).LanguageModel = {
        availability: async () => availability,
        create: async () => ({
          prompt: async (msgs: Array<{ content: Array<{ value: string }> }>, opts?: { responseConstraint?: unknown }) => {
            const text = msgs.map((m) => m.content.map((c) => c.value).join('')).join('\n');
            calls.push({ text, constraint: opts?.responseConstraint });
            return reply(text);
          },
          destroy() {},
        }),
      };
    },
    { availability, replySrc: fakeModelReply.toString() },
  );
}

/** Loads the demo squad from the welcome screen. */
export async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo squad' }).click();
  await expect(page.getByText(/of 12 players/)).toBeVisible();
}

/** Starts today's session and returns to the capture screen. */
export async function startSession(page: Page, focus = 'Passing and receiving') {
  await page.getByRole('button', { name: /Start today's session/ }).click();
  await page.getByRole('textbox', { name: /Focus/ }).fill(focus);
  await page.getByRole('button', { name: 'Start capturing' }).click();
  await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();
}

export async function addNote(page: Page, player: string, chips: string[], text = '') {
  await page.getByRole('button', { name: new RegExp(`^${player}:`) }).click();
  const dialog = page.getByRole('dialog', { name: player });
  for (const c of chips) await dialog.getByRole('button', { name: c, exact: true }).click();
  if (text) await dialog.getByRole('textbox', { name: 'Anything else?' }).fill(text);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
}

export function bodiesWithNames(log: CloudLog): string[] {
  return log.requests
    .map((r) => r.body)
    .filter((b) => DEMO_NAMES.some((n) => new RegExp(`\\b${n}\\b`, 'i').test(b)));
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Chrome's own message when its on-device model service isn't installed on this machine,
      // and network errors from the deliberately refused Firebase side endpoints above.
      if (/Unable to create a text session because the service is not running|net::ERR_CONNECTION_REFUSED|Failed to load resource/.test(t)) return;
      errors.push(t);
    });
    await use(errors);
  },
});

export { expect };
