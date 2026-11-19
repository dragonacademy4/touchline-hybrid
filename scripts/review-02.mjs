import {setup,URL} from './review-lib.mjs';
const {b,p,errs,dump}=await setup();
await p.goto(URL); await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(5000);
await dump('03-today-settled',{text:false});
await p.getByRole('button', { name: /Start today's session/ }).click(); await p.waitForTimeout(800);
await dump('04-start-sheet',{full:false});
await b.close(); console.log('ERRS',errs);
