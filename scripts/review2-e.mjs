let t0=Date.now();
import {setup,URL,OUT} from './review2-lib.mjs';
const w=+process.argv[2]||375;
const {p,b,dump,errs,reqs}=await setup({width:w,tag:'-upd'});
p.on('request',r=>{if(/vertexai/.test(r.url())) console.log('REQ',r.url().slice(60),Date.now()-t0)}); p.on('requestfailed',r=>{if(/vertexai/.test(r.url())) console.log('FAILED',r.failure()?.errorText,Date.now()-t0)}); p.on('response',async r=>{if(/vertexai/.test(r.url())) console.log('RESP',r.status(),r.url().slice(60), Date.now()-t0);});
await p.goto(URL); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(4000);
await p.goto(URL+'#/updates'); await p.waitForTimeout(1000);

t0=Date.now(); await p.getByRole('button',{name:/Write this week/}).click(); await p.waitForTimeout(2000);
if(await p.getByTestId('send-check').count()){console.log('SENDCHECK'); await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click();}
await p.getByText(/Putting names back/).waitFor({state:'detached',timeout:150000}).catch(()=>console.log('still waiting'));
console.log('elapsed',Date.now()-t0);
await p.waitForTimeout(1500);
await dump('40-update');
const peek=p.getByText(/What the (model|cloud) saw/).first(); if(await peek.count()){await peek.click(); await p.waitForTimeout(400); console.log((await p.locator('pre, .peek, details').last().innerText()).slice(0,5000));}
console.log('ERRS',errs);
await b.close();
