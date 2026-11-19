// Renders public/og.png (1200×630) from a real screenshot of the live app.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const url = process.env.TOUCHLINE_URL ?? 'https://touchline.impactlayer.workers.dev';
const b = await chromium.launch({ channel: 'chrome' });
const phone = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await phone.goto(url);
await phone.getByRole('button', { name: 'Try the demo squad' }).click();
await phone.getByText(/of 12 players/).waitFor();
await phone.waitForTimeout(4500); // let the toast go
const shot = (await phone.screenshot()).toString('base64');
const font = (f) => readFileSync(`node_modules/@fontsource/${f}`).toString('base64');
const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<html><head><style>
@font-face{font-family:B;src:url(data:font/woff2;base64,${font('barlow-condensed/files/barlow-condensed-latin-700-normal.woff2')})}
@font-face{font-family:A;src:url(data:font/woff2;base64,${font('atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2')})}
body{margin:0;width:1200px;height:630px;background:#123b2c;color:#f5f3ec;font-family:A;overflow:hidden;position:relative}
.c{position:absolute;right:-140px;top:-160px;width:640px;height:640px;border:5px solid rgba(245,243,236,.12);border-radius:50%}
.l{position:absolute;left:0;right:0;top:470px;height:5px;background:rgba(245,243,236,.08)}
h1{font-family:B;font-size:92px;line-height:.95;margin:0}
.t{position:absolute;left:72px;top:110px;width:600px}
p{font-size:30px;line-height:1.35;margin:24px 0 0;opacity:.92}
.k{display:inline-block;margin-top:28px;font-size:22px;padding:8px 16px;border-radius:999px;background:rgba(245,243,236,.12)}
img{position:absolute;right:90px;top:46px;width:300px;border-radius:34px;border:10px solid #0b241b;box-shadow:0 30px 60px rgba(0,0,0,.35)}
.f{display:inline-block;width:56px;height:56px;margin-bottom:22px}
</style></head><body><div class="c"></div><div class="l"></div>
<div class="t"><svg class="f" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f5f3ec"/><path d="M6 25h20M11 25V7" stroke="#123b2c" stroke-width="2.2" stroke-linecap="round"/><path d="M11 7.5h10l-3 3.5 3 3.5H11" fill="#c2410c"/></svg>
<h1>Touchline</h1><p>Feedback for every player, two minutes after training. Children's names are hidden before anything leaves the phone.</p>
<span class="k">Gemini Nano on-device · cloud with names hidden</span></div>
<img src="data:image/png;base64,${shot}"></body></html>`);
await page.screenshot({ path: 'public/og.png' });
await b.close();
console.log('og.png written');
