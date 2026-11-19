import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
await p.addInitScript((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, process.env.TOKEN);
await p.goto('http://localhost:5287/probe/');
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
for (const m of process.argv.slice(2)) console.log(await p.evaluate((m) => window.probe(m), m));
await b.close();
