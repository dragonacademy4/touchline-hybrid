import {demoWithSession} from './review-flow.mjs';
import {URL} from './review-lib.mjs';
const s=await demoWithSession({noSession:true}); const {p,b,errs,dump}=s;
await p.getByRole('link',{name:'Squad'}).click(); await p.waitForTimeout(800);
await dump('24-squad');
const add=p.getByRole('button',{name:/Add/i}).first(); console.log('add btns', await p.getByRole('button',{name:/Add/i}).allInnerTexts());
await add.click(); await p.waitForTimeout(600);
await dump('25-add-player',{full:false});
// validation: empty save
const save=p.getByRole('button',{name:/Save|Add player|Add$/}).last(); console.log('save label', await save.innerText());
await save.click(); await p.waitForTimeout(500);
await dump('26-add-empty-validate',{full:false,text:false});
const inp=p.locator('input:visible').first();
await inp.fill('Ollie'); await save.click(); await p.waitForTimeout(500);
await dump('27-add-duplicate',{full:false});
await inp.fill('Zara-Louise O\'Connor-Whitfield'); await save.click(); await p.waitForTimeout(800);
await dump('28-after-add');
await b.close(); console.log('ERRS',errs);
