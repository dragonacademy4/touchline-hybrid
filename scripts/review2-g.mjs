import {setup,URL,OUT} from './review2-lib.mjs';
const w=+process.argv[2]||375;
const {p,b,dump,errs}=await setup({width:w,tag:'-sq'});
const vp=async n=>{await p.screenshot({path:`${OUT}${w}-sq-${n}.png`}); console.log('SHOT',n);};
await p.goto(URL); await p.waitForTimeout(2500);
await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(4000);
await p.goto(URL+'#/squad'); await p.waitForTimeout(800);
await p.getByRole('button',{name:'Add player'}).click(); await p.waitForTimeout(500);
const name=p.locator('#pname'); const group=p.getByPlaceholder('e.g. Under 9s');
const save=async(btn='Save')=>{await p.getByRole('button',{name:btn,exact:true}).click(); await p.waitForTimeout(500); console.log('  errors:',await p.locator('.field-error').allInnerTexts(), '| toast:', await p.locator('[role=status],.toast').allInnerTexts().catch(()=>[]));};
console.log('empty'); await save(); await vp('60-empty');
for(const v of ['a Ollie','Ollie','Ollie Smith','ollie','Sam B','Jo-Anne','12']){ await name.fill(v); console.log('name='+JSON.stringify(v)+' group='+await group.inputValue()); await save('Save + next'); await vp('61-'+v.replace(/\W/g,'_')); }
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
await dump('62-squad-after');
// own player
await p.getByRole('button',{name:'Add player'}).click(); await p.waitForTimeout(400);
await name.fill('Zara'); await group.fill('Under 10s'); await save(); await p.waitForTimeout(500);
// remove player Rhys from player page
await p.goto(URL+'#/player/demo-p7'); await p.waitForTimeout(800);
await p.getByRole('button',{name:'Edit Rhys'}).click(); await p.waitForTimeout(400);
await p.getByRole('button',{name:/Remove/}).first().click(); await p.waitForTimeout(400); await vp('63-remove-choice');
await p.getByRole('button',{name:/Erase their notes too/}).click(); await p.waitForTimeout(1000);
console.log('URL after erase',p.url()); await vp('64-after-erase');
// settings remove demo
await p.goto(URL+'#/settings'); await p.waitForTimeout(800);
p.once('dialog',d=>{console.log('DIALOG',d.message()); d.accept();});
await p.getByRole('button',{name:'Remove demo squad'}).click(); await p.waitForTimeout(800); await vp('65-remove-demo');
const confirm=p.getByRole('button',{name:/Remove demo|Remove|Yes/}).last(); console.log('body tail', (await p.locator('body').innerText()).slice(-800));
if(await p.getByRole('dialog').count()){ await vp('65b-dialog'); await p.getByRole('dialog').getByRole('button',{name:/Remove/}).click(); await p.waitForTimeout(1200);}
await p.goto(URL+'#/squad'); await p.waitForTimeout(800); await dump('66-squad-after-demo-removed');
await p.goto(URL); await p.waitForTimeout(800); await dump('67-today-after-demo-removed');
console.log('ERRS',errs); await b.close();
