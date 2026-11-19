import { addNote, bodiesWithNames, expect, fakeGeminiNano, mockFirebase, startDemo, startSession, test, QA } from './fixtures';

test('on-device path: with Gemini Nano available, structuring never calls the cloud', async ({ page, consoleErrors }, info) => {
  await fakeGeminiNano(page, 'available');
  const log = await mockFirebase(page);
  await startDemo(page);
  await expect(page.getByRole('link', { name: /AI: AI runs on this device with Gemini Nano/ })).toBeVisible();
  await startSession(page);
  await addNote(page, 'Theo', ['Listened'], 'Theo was talking to Nia the whole time');
  await page.getByRole('button', { name: 'Structure on this phone' }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.locator('[data-source="on_device"]').first()).toBeVisible();
  await expect(page.getByText('Brilliant effort today, Theo!')).toBeVisible();
  await page.screenshot({ path: `${QA}/e2e/${info.project.name}-08-on-device-TEST-DOUBLE.png`, fullPage: true });

  // No request to the cloud model at all.
  expect(log.requests.filter((r) => r.url.includes('firebasevertexai'))).toEqual([]);
  // The on-device model got the JSON schema as a response constraint, and masked text.
  const calls = await page.evaluate(() => (window as unknown as { __nanoCalls: Array<{ text: string; constraint: { required?: string[] } }> }).__nanoCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].constraint.required).toEqual(['players', 'summary', 'flags']);
  expect(calls[0].text).toContain('[P09] was talking to [P10] the whole time');
  expect(calls[0].text).not.toMatch(/Theo|Nia/);
  expect(consoleErrors).toEqual([]);
});

test('offline: notes save, no AI runs, chips give a plain record; back online, AI upgrades it', async ({ page, context, consoleErrors }) => {
  const log = await mockFirebase(page);
  await startDemo(page);
  await startSession(page);
  await context.setOffline(true);
  await expect(page.getByRole('link', { name: /^Offline\. AI:/ })).toBeVisible();
  await expect(page.getByText('No signal, and no on-device model here')).toBeVisible();
  await addNote(page, 'Kai', ['Worked hard', 'Hold position']);
  await page.getByRole('button', { name: 'Save notes (no AI right now)' }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.locator('[data-source="chips"]').first()).toBeVisible();
  await expect(page.getByText('Real effort.')).toBeVisible();
  await expect(page.getByText('Keep working on holding their position.')).toBeVisible();
  expect(log.requests.filter((r) => r.url.includes('firebasevertexai'))).toEqual([]);

  // Cloud reports explain themselves offline.
  await page.goto('/#/updates');
  await expect(page.getByText("You're offline. Cloud reports need signal; everything else works.")).toBeVisible();

  await context.setOffline(false);
  await page.goto('/#/');
  await page.getByRole('link', { name: /Passing and receiving.*Today/ }).click();
  await page.getByRole('button', { name: 'Structure with AI' }).click();
  await expect(page.locator('[data-source="in_cloud"]').first()).toBeVisible();
  await expect(page.getByText('Brilliant effort today, Kai!')).toBeVisible();
  expect(bodiesWithNames(log)).toEqual([]);
  expect(consoleErrors.filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});

for (const [behaviour, message] of [
  ['429', 'The cloud model is busy'],
  ['500', 'Something went wrong'],
  ['garbage', 'The answer came back muddled'],
] as const) {
  test(`cloud failure (${behaviour}) shows a clear error, retry works, and "Save without AI" is a way out`, async ({ page }) => {
    let mode: 'ok' | typeof behaviour = behaviour;
    await mockFirebase(page, () => mode);
    await startDemo(page);
    await startSession(page);
    await addNote(page, 'Isla', ['Brave']);
    await page.getByRole('button', { name: 'Structure in the cloud' }).click();
    await expect(page.getByRole('heading', { name: message })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Your notes are safe|Try again|Wait a minute/).first()).toBeVisible();
    mode = 'ok';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByText('Brilliant effort today, Isla!')).toBeVisible();
  });
}

test('cloud failure: "Save without AI" keeps a usable record', async ({ page }) => {
  await mockFirebase(page, '500');
  await startDemo(page);
  await startSession(page);
  await addNote(page, 'Isla', ['Brave', 'Shooting']);
  await page.getByRole('button', { name: 'Structure in the cloud' }).click();
  await page.getByRole('button', { name: 'Save without AI' }).click({ timeout: 30_000 });
  await expect(page.locator('[data-source="chips"]').first()).toBeVisible();
  await expect(page.getByText('Well done Isla, bravery on the ball today!')).toBeVisible();
});

test('cloud switched off: session notes use chips, reports explain why', async ({ page }) => {
  const log = await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/settings');
  await page.getByRole('switch', { name: /Use cloud AI when it helps/ }).uncheck();
  await page.goto('/#/');
  await startSession(page);
  await addNote(page, 'Rhys', ['Strong tackle']);
  await expect(page.getByText('Cloud is switched off and Gemini Nano is not available')).toBeVisible();
  await page.getByRole('button', { name: 'Save notes (no AI right now)' }).click();
  await expect(page.locator('[data-source="chips"]').first()).toBeVisible();
  await page.goto('/#/player/demo-p4');
  await expect(page.getByText('Cloud AI is switched off in Settings.')).toBeVisible();
  expect(log.requests.filter((r) => r.url.includes('firebasevertexai'))).toEqual([]);
});

test('extra hidden words never reach the cloud', async ({ page }) => {
  const log = await mockFirebase(page);
  await startDemo(page);
  await page.goto('/#/settings');
  await page.getByRole('textbox', { name: 'Word to hide' }).fill('Riverside Juniors');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop hiding Riverside Juniors' })).toBeVisible();
  await page.goto('/#/');
  await startSession(page, 'Riverside Juniors friendly');
  await addNote(page, 'Nia', ['Brave'], 'Best player at Riverside Juniors today, call mum on 07700 900123');
  await page.getByRole('button', { name: 'Structure in the cloud' }).click();
  await expect(page).toHaveURL(/\/review$/);
  const body = log.requests.find((r) => r.url.includes('firebasevertexai'))!.body;
  expect(body).not.toMatch(/Riverside|900123|Nia/);
  expect(body).toContain('[X1]');
});

test('check before it goes: names outside the squad are caught and hidden before sending', async ({ page }, info) => {
  const log = await mockFirebase(page);
  await startDemo(page);
  await startSession(page);
  await addNote(page, 'Ollie', ['Brave'], 'Ollie helped Mason up, mum Sarah Jones was watching');
  await page.getByRole('button', { name: 'Structure in the cloud' }).click();
  const check = page.getByTestId('send-check');
  await expect(check.getByText('Check before it goes')).toBeVisible();
  await expect(check.getByRole('button', { name: 'Mason' })).toHaveAttribute('aria-pressed', 'true');
  await expect(check.getByRole('button', { name: 'Sarah Jones' })).toHaveAttribute('aria-pressed', 'true');
  expect(log.requests.filter((r) => r.url.includes('firebasevertexai'))).toEqual([]);
  await page.screenshot({ path: `${QA}/e2e/${info.project.name}-09-check-before-send.png` });
  await check.getByRole('button', { name: 'Hide 2 and send' }).click();
  await expect(page).toHaveURL(/\/review$/);
  const body = log.requests.find((r) => r.url.includes('firebasevertexai'))!.body;
  expect(body).not.toMatch(/Mason|Sarah|Jones|Ollie/);
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Stop hiding Mason' })).toBeVisible();
});

test('check before it goes: Cancel sends nothing', async ({ page }) => {
  const log = await mockFirebase(page);
  await startDemo(page);
  await startSession(page);
  await addNote(page, 'Ollie', [], 'Played well with Kayden');
  await page.getByRole('button', { name: 'Structure in the cloud' }).click();
  await page.getByTestId('send-check').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(log.requests.filter((r) => r.url.includes('firebasevertexai'))).toEqual([]);
});
