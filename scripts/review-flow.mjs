import {setup,URL} from './review-lib.mjs';
export async function demoWithSession(opts={}){
  const s=await setup(opts); const p=s.p;
  await p.goto(URL); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(4500);
  if(opts.noSession) return s;
  await p.getByRole('button', { name: /Start today's session/ }).click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Passing and receiving' }).click();
  await p.getByRole('button', { name: 'Start capturing' }).click(); await p.waitForTimeout(1000);
  const note=async(name,chips,text)=>{await p.getByRole('button', { name: new RegExp('^'+name) }).click(); await p.waitForTimeout(500); for(const c of chips) await p.getByRole('button', { name: c, exact:true }).click(); if(text) await p.getByRole('textbox', { name: 'Anything else?' }).fill(text); await p.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(400);};
  await note('Ollie',['Brave','Weak foot'],'Ollie scored with his left foot and helped Seren up after she fell. Told Mason well done too.');
  await note('Rhys',['Talk more','Took a knock'],'Rhys knocked his knee in the first drill, sat out ten minutes, mum Sarah Jones picked him up. Great with Kai at the end.');
  await note('Amara',['Great first touch','Good passing'],'');
  await note('Theo',[],'theo was really quiet today, said his dad moved out. keep an eye. Played well in goal though.');
  await p.getByPlaceholder(/How did the session go/).fill('Good energy. Ollie and Amara linked up well. Need more water breaks.');
  if(opts.noStructure) return s;
  await p.getByRole('button', { name: /Structure/ }).click();
  await p.waitForURL(/review/,{timeout:60000}); await p.waitForTimeout(1500);
  return s;
}
