// Renders the PWA icons from the Touchline mark with headless Chrome.
import { chromium } from '@playwright/test';
const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
<rect width="32" height="32" ${pad ? '' : 'rx="7"'} fill="#123b2c"/>
<g transform="${pad ? 'translate(4.8 4.8) scale(0.7)' : ''}">
<path d="M6 25h20M11 25V7" stroke="#f5f3ec" stroke-width="2.2" stroke-linecap="round"/>
<path d="M11 7.5h10l-3 3.5 3 3.5H11" fill="#e2581b"/></g></svg>`;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
for (const [name, size, pad, bg] of [['icon-192', 192, false, 'transparent'], ['icon-512', 512, false, 'transparent'], ['maskable-512', 512, true, '#123b2c'], ['apple-touch-icon', 180, true, '#123b2c']]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:${bg}">${mark(pad)}</body></html>`);
  await p.screenshot({ path: `public/icons/${name}.png`, omitBackground: bg === 'transparent' });
}
await b.close();
console.log('icons done');
