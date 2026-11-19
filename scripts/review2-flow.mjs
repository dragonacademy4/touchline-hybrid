import {setup,URL} from './review2-lib.mjs';
export async function capture(opts={}){
  const s=await setup(opts); const p=s.p;
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Try the demo squad' }).click(); await p.waitForTimeout(4000);
  await p.getByRole('button', { name: /Start today's session/ }).click(); await p.waitForTimeout(700);
  if(opts.shotStart) await s.dump('10-start-sheet');
  await p.getByRole('button', { name: 'Passing and receiving' }).click();
  await p.getByRole('button', { name: 'Start capturing' }).click(); await p.waitForTimeout(1000);
  const note=async(name,chips,text,shot)=>{await p.getByRole('button', { name: new RegExp('^'+name) }).click(); await p.waitForTimeout(500); for(const c of chips) await p.getByRole('button', { name: c, exact:true }).click(); if(text) await p.getByRole('textbox', { name: 'Anything else?' }).fill(text); if(shot) await s.dump(shot); await p.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(400);};
  await note('Ollie',['Brave','Weak foot'],'Ollie scored with his left foot and helped Seren up after she fell. Told Mason well done too.',opts.shotNote?'11-note-sheet':null);
  await note('Rhys',['Talk more','Took a knock'],'Rhys knocked his knee in the first drill, sat out ten minutes, mum Sarah Jones picked him up. Great with Kai at the end.');
  await note('Amara',['Great first touch','Good passing'],'');
  await note('Theo',[],'theo was really quiet today, said his dad moved out. keep an eye. Played well in goal though.');
  await p.getByPlaceholder(/How did the session go/).fill('Good energy. Ollie and Amara linked up well. Need more water breaks.');
  return s;
}
