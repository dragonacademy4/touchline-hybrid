// Main flow, 1 cloud call at most
import {capture} from './review2-flow.mjs';
const w=+process.argv[2]||375;
const s=await capture({width:w,shotStart:true,shotNote:true}); const {p,dump,b,errs,reqs}=s;
await dump('12-capture');
await p.getByRole('button', { name: /Structure/ }).click(); await p.waitForTimeout(2500);
await dump('13-after-structure-click');
const chk=p.getByTestId('send-check');
if(await chk.count()){ await p.locator('details.disclosure summary').click().catch(()=>{}); await dump('14-send-check-open');
  await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click(); }
await p.waitForURL(/review/,{timeout:90000}).catch(e=>console.log('NO REVIEW URL')); await p.waitForTimeout(2000);
await dump('15-review');
console.log('SESSION URL',p.url());
// open what model saw
const peek=p.getByText(/What the (model|cloud) saw/).first(); if(await peek.count()){await peek.click(); await p.waitForTimeout(400); await dump('16-review-peek');}
console.log('ERRS',errs); console.log('REQS',reqs.filter(r=>/vertexai|firestore/.test(r)).join('\n\n'));
await p.context().storageState({path:'/tmp/r2-state.json'});
// export IDB? keep browser open for card
const theo=p.getByRole('link',{name:/Player card/}).last();
const cards=await p.getByRole('link',{name:/Player card/}).evaluateAll(a=>a.map(x=>x.href)); console.log('CARDS',cards);
for(const [i,u] of cards.entries()){ await p.goto(u); await p.waitForTimeout(1500); await dump('17-card-'+i);}
await b.close();
