import {setup,URL,OUT} from './review2-lib.mjs';
const w=+process.argv[2]||768; const scheme=process.argv[3]||'light';
const {p,b,errs}=await setup({width:w,height:w>1400?1080:900,scheme,tag:'-rs'});
const tag=`${w}${scheme==='dark'?'-dark':''}-rs`;
const shot=async n=>{await p.screenshot({path:`${OUT}${tag}-${n}.png`,fullPage:true}); const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth); console.log(n,'hscroll',ov);};
await p.goto(URL); await p.waitForTimeout(2500); await shot('70-welcome');
await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(5000);
await shot('71-today');
const s=await p.locator('a[href*="#/session/"]').first().getAttribute('href'); console.log('first session',s);
await p.goto(URL+s); await p.waitForTimeout(1200); await shot('72-session');
const card=await p.locator('a[href*="/card/"]').first().getAttribute('href').catch(()=>null);
if(card){await p.goto(URL+card); await p.waitForTimeout(1200); await shot('73-card');}
await p.goto(URL+'#/squad'); await p.waitForTimeout(800); await shot('74-squad');
await p.goto(URL+'#/player/demo-p1'); await p.waitForTimeout(800); await shot('75-player');
await p.goto(URL+'#/settings'); await p.waitForTimeout(800); await shot('76-settings');
await p.goto(URL+'#/updates'); await p.waitForTimeout(800); await shot('77-updates');
console.log('ERRS',errs.filter(e=>!/text session|requestStorage/.test(e))); await b.close();
