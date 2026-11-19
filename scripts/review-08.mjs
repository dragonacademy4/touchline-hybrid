import {demoWithSession} from './review-flow.mjs';
const s=await demoWithSession({noSession:true}); const {p,b,errs,dump}=s;
console.log('label check', await p.goto('https://touchline.impactlayer.workers.dev/#/squad').then(()=>1));
await p.waitForTimeout(800);
await p.getByRole('link',{name:/Freya/}).click(); await p.waitForTimeout(1000);
await dump('29-player-freya');
const btns=await p.getByRole('button').allInnerTexts(); console.log('BTNS',btns);
const rep=p.getByRole('button',{name:/report|progress/i}).first();
if(await rep.count()){ const t0=Date.now(); await rep.click(); await p.waitForTimeout(700); await dump('30-report-loading',{full:false,text:false});
 for(let i=0;i<60;i++){await p.waitForTimeout(1000); const t=await p.locator('body').innerText(); if(!/Writing|Working|Generating|Sending/i.test(t)) break;}
 console.log('report took',Date.now()-t0); await p.waitForTimeout(1000); await dump('31-report'); }
await b.close(); console.log('ERRS',errs);
