import { chromium } from '@playwright/test';
export const URL='https://touchline.impactlayer.workers.dev/';
export async function setup({width=375,height=812,scheme='light',tag=''}={}){
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: width<500?2:1, colorScheme:scheme, acceptDownloads:true, permissions:['clipboard-read','clipboard-write'] });
  const p = await ctx.newPage();
  const errs=[]; p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
  const dump=async(n,{full=true,text=true}={})=>{await p.screenshot({path:`../qa/review/${width}${scheme==='dark'?'-dark':''}${tag}-${n}.png`,fullPage:full}); console.log('\n=== '+n+' '+p.url()); if(text){console.log((await p.locator('body').innerText()).slice(0,3000)); const c=await p.locator('button:visible,a:visible,[role=button]:visible,input:visible,textarea:visible,select:visible').evaluateAll(es=>es.map(e=>`${e.tagName}:${e.getAttribute('aria-label')||e.innerText||e.placeholder||e.name||''}`.trim().replace(/\s+/g,' ').slice(0,60)));console.log('CONTROLS:',c.join(' | '));}};
  return {b,ctx,p,errs,dump};
}
