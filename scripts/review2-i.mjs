import {setup,URL,OUT} from './review2-lib.mjs';
import fs from 'fs';
const axe=fs.readFileSync('node_modules/axe-core/axe.min.js','utf8');
for(const scheme of ['light','dark']){
const {p,b}=await setup({width:375,scheme});
const run=async n=>{await p.addScriptTag({content:axe}); const r=await p.evaluate(async()=>await axe.run(document,{runOnly:['wcag2a','wcag2aa']})); console.log(scheme,n, r.violations.map(v=>`${v.id}(${v.nodes.length}): ${v.nodes.slice(0,3).map(x=>x.target.join(' ')+' '+(x.any[0]?.message||'')).join(' || ')}`).join('\n   ')||'clean');};
await p.goto(URL); await p.waitForTimeout(2500); await run('welcome');
await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(5000); await run('today');
await p.goto(URL+'#/session/demo-s3/review'); await p.waitForTimeout(1000); await run('review');
await p.goto(URL+'#/session/demo-s3/card/demo-p11'); await p.waitForTimeout(1000); await run('card');
await p.goto(URL+'#/settings'); await p.waitForTimeout(800); await run('settings');
await p.goto(URL+'#/player/demo-p1'); await p.waitForTimeout(800); await run('player');
await p.goto(URL); await p.waitForTimeout(800);
await p.getByRole('button', { name: /Start today's session/ }).click(); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Start capturing' }).click(); await p.waitForTimeout(800); await run('capture');
await p.getByRole('button', { name: /^Ollie/ }).click(); await p.waitForTimeout(500); await run('note-sheet');
await p.screenshot({path:`${OUT}375${scheme==='dark'?'-dark':''}-a11y-note-sheet-vp.png`});
await b.close();}
