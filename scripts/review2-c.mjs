// offline fallback: no cloud calls
import {capture} from './review2-flow.mjs';
const w=+process.argv[2]||375; const mode=process.argv[3]||'offline';
const s=await capture({width:w,tag:'-'+mode}); const {p,dump,b,errs,reqs,ctx}=s;
if(mode==='offline') await ctx.setOffline(true);
else await p.route(/firebasevertexai\.googleapis\.com/,r=>r.abort());
await p.waitForTimeout(1500);
await p.screenshot({path:`/home/dylan/cloud-work/projects/comp-touchline/qa/review2/${w}-${mode}-20-capture-header.png`});
await dump('21-capture');
await p.getByRole('button', { name: /Structure|Save|notes/i }).last().click().catch(e=>console.log('no structure btn',e.message)); await p.waitForTimeout(4000);
await p.screenshot({path:`/home/dylan/cloud-work/projects/comp-touchline/qa/review2/${w}-${mode}-22-after-click-vp.png`});
await dump('22-after-click');
const chk=p.getByTestId('send-check'); if(await chk.count()){ console.log('SENDCHECK shown'); await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click(); await p.waitForTimeout(8000); await p.screenshot({path:`/home/dylan/cloud-work/projects/comp-touchline/qa/review2/${w}-${mode}-23-after-send-vp.png`}); await dump('23-after-send');}
// try fallback buttons
for(const name of [/without AI|no AI|Save without|Use my notes|basic/i]){const bt=p.getByRole('button',{name}); if(await bt.count()){console.log('clicking',await bt.first().innerText()); await bt.first().click(); await p.waitForTimeout(2500);}}
await p.waitForTimeout(1000);
await dump('24-result');
const cards=await p.getByRole('link',{name:/Player card/}).evaluateAll(a=>a.map(x=>x.href)); console.log('CARDS',cards);
for(const [i,u] of cards.entries()){ await p.goto(u); await p.waitForTimeout(1200); await dump('25-card-'+i,{text:true});}
if(cards.length){ const dl=p.waitForEvent('download',{timeout:8000}).catch(()=>null); await p.getByRole('button',{name:/Download/}).click(); const d=await dl; if(d){const path=`/home/dylan/cloud-work/projects/comp-touchline/qa/review2/${w}-${mode}-26-download.png`; await d.saveAs(path); console.log('DOWNLOADED',path, d.suggestedFilename());} else {console.log('no download event'); await dump('26-after-dl');}}
console.log('ERRS',errs); console.log('REQS',reqs.filter(r=>/vertexai|firestore/.test(r)).map(r=>r.slice(0,300)).join('\n'));
await b.close();
