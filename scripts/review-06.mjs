import {demoWithSession} from './review-flow.mjs';
const s=await demoWithSession(); const {p,b,errs,dump}=s;
await p.getByText('What the model saw').click(); await p.waitForTimeout(800);
await dump('18-model-saw');
await p.getByText('What the model saw').scrollIntoViewIfNeeded(); await p.screenshot({path:'../qa/review/375-18b-model-saw-vp.png'});
// edit feedback
await p.getByRole('button',{name:'Edit feedback for Theo'}).click(); await p.waitForTimeout(600);
await dump('19-edit-feedback',{full:false});
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
const close=p.getByRole('button',{name:/Close|Cancel/}).first(); if(await close.isVisible().catch(()=>false)) await close.click();
await p.waitForTimeout(400);
// player card
await p.getByRole('link',{name:'Player card'}).nth(1).click(); await p.waitForTimeout(1500);
await dump('20-player-card');
await p.screenshot({path:'../qa/review/375-20b-card-vp.png'});
const dl=p.waitForEvent('download',{timeout:8000}).catch(e=>null);
const dlb=p.getByRole('button',{name:/Download/}); if(await dlb.count()){await dlb.first().click(); const d=await dl; if(d){await d.saveAs('../qa/review/card-download'+(d.suggestedFilename().match(/\.\w+$/)||['.png'])[0]); console.log('DOWNLOAD',d.suggestedFilename());} else console.log('no download event');}
await p.waitForTimeout(800); await p.screenshot({path:'../qa/review/375-21-after-download.png'});
const cp=p.getByRole('button',{name:/Copy/}); if(await cp.count()){await cp.first().click(); await p.waitForTimeout(500); await p.screenshot({path:'../qa/review/375-22-after-copy.png'}); try{console.log('CLIP',await p.evaluate(()=>navigator.clipboard.readText()))}catch(e){console.log('clip err',e.message)}}
const sh=p.getByRole('button',{name:/Share/}); if(await sh.count()){await sh.first().click(); await p.waitForTimeout(1000); await p.screenshot({path:'../qa/review/375-23-after-share.png'}); console.log('after share text:', (await p.locator('body').innerText()).slice(-400));}
await b.close(); console.log('ERRS',errs);
