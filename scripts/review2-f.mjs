// verify what is actually sent; intercept and abort (no real cloud cost)
import {setup,URL,OUT} from './review2-lib.mjs';
const w=+process.argv[2]||375;
const {p,b,dump}=await setup({width:w,tag:'-leak'});
let bodies=[]; await p.route(/firebasevertexai/,r=>{bodies.push(r.request().postData()); r.abort();});
await p.goto(URL); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(4000);
await p.getByRole('button', { name: /Start today's session/ }).click(); await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Start capturing' }).click(); await p.waitForTimeout(800);
const note=async(name,text)=>{await p.getByRole('button', { name: new RegExp('^'+name) }).click(); await p.waitForTimeout(400); await p.getByRole('textbox', { name: 'Anything else?' }).fill(text); await p.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(300);};
await note('Ollie','Told Mason well done. told jack he did great. Coach Dave said good. Mrs Patel collected him. Grandad Pete watched. Plays for Cardiff Met on Sundays at St Mary\'s school. Olly scored twice. Brother Harrison also came.');
await p.getByRole('button', { name: /Structure/ }).click(); await p.waitForTimeout(2000);
await p.screenshot({path:`${OUT}${w}-leak-50-check-vp.png`});
console.log('CHECK TEXT:', await p.getByTestId('send-check').innerText().catch(()=>'none'));
await p.getByRole('button',{name:/Hide \d+ and send|Send as it is/}).click(); await p.waitForTimeout(5000);
for(const bd of bodies){ const m=bd.match(/Notes per player[\s\S]*?(?=Return JSON)/); console.log('SENT:', m?m[0]:bd.slice(0,1500)); }
await p.screenshot({path:`${OUT}${w}-leak-51-after-vp.png`});
console.log((await p.locator('body').innerText()).slice(-600));
await b.close();
