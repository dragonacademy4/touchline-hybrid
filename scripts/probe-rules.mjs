import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
await p.goto('http://localhost:5287/tests/live/rules/');
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
console.log(await p.evaluate(() => window.probe()));
await b.close();
