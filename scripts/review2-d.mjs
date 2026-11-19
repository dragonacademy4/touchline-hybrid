// cloud at given width: structure (1), updates (1), progress (1)
import {capture} from './review2-flow.mjs';
import {URL,OUT} from './review2-lib.mjs';
const w=+process.argv[2]||1440;
const s=await capture({width:w,height:w>500?900:812,tag:'-cloud'}); const {p,dump,b,errs,reqs}=s;
await p.getByRole('button', { name: /Structure/ }).click(); await p.waitForTimeout(2500);
await p.screenshot({path:`${OUT}${w}-cloud-30-sendcheck-vp.png`}); console.log('sendcheck count',await p.getByTestId('send-check').count());
await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click();
await p.waitForURL(/review/,{timeout:90000}); await p.waitForTimeout(2000);
await dump('31-review',{text:false});
console.log((await p.locator('main').innerText()).slice(0,2500));
// updates
await p.goto(URL+'#/updates'); await p.waitForTimeout(1000);
await p.getByRole('button',{name:/Write this week/}).click(); await p.waitForTimeout(2500);
if(await p.getByTestId('send-check').count()){console.log('SENDCHECK on update'); await p.screenshot({path:`${OUT}${w}-cloud-32-update-check-vp.png`}); await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click();}
await p.waitForTimeout(15000);
await dump('33-update');
// progress for Freya
await p.goto(URL+'#/player/demo-p4'); await p.waitForTimeout(1200);
await dump('34-player-freya');
await p.getByRole('button',{name:/progress report/}).click(); await p.waitForTimeout(2500);
if(await p.getByTestId('send-check').count()){console.log('SENDCHECK on progress'); await p.screenshot({path:`${OUT}${w}-cloud-35-progress-check-vp.png`}); await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click();}
await p.waitForTimeout(15000);
await dump('36-progress');
console.log('ERRS',errs); console.log('REQS',reqs.filter(r=>/vertexai/.test(r)).map(r=>r.slice(0,200)).join('\n'));
await b.close();
