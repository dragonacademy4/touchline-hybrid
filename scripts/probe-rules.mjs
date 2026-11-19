// Runs the live Firestore rules probe (tests/live/rules/index.html) through the Vite dev server.
// Usage: npx vite --port 5287 & node scripts/probe-rules.mjs
import { chromium } from '@playwright/test';
const port = process.env.PORT ?? '5287';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
await p.goto(`http://localhost:${port}/tests/live/rules/`);
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
console.log(await p.evaluate(() => window.probe()));
await b.close();
