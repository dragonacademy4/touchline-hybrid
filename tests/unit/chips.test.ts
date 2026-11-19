import { describe, expect, it } from 'vitest';
import { chipById, CHIPS, observationFromChips, welfareFlags } from '../../src/lib/chips';
import { note } from './helpers';

describe('CHIPS', () => {
  it('has unique ids and labels, and every kind', () => {
    expect(new Set(CHIPS.map((c) => c.id)).size).toBe(CHIPS.length);
    expect(new Set(CHIPS.map((c) => c.label)).size).toBe(CHIPS.length);
    expect(new Set(CHIPS.map((c) => c.kind))).toEqual(new Set(['strength', 'work_on', 'welfare']));
    for (const c of CHIPS) expect(c.phrase).toBe(c.phrase.toLowerCase());
  });
  it('chipById finds chips and returns undefined otherwise', () => {
    expect(chipById('brave')?.label).toBe('Brave');
    expect(chipById('nope')).toBeUndefined();
  });
});

describe('observationFromChips', () => {
  it('joins one, two and three strengths naturally', () => {
    expect(observationFromChips(note('a', ['brave']), 'Ollie')).toEqual({
      playerId: 'a',
      strength: 'Bravery on the ball.',
      nextStep: 'Keep it up at the next session.',
      praise: 'Well done Ollie, bravery on the ball today!',
    });
    expect(observationFromChips(note('a', ['brave', 'effort']), 'Ollie')!.strength).toBe('Bravery on the ball and real effort.');
    expect(observationFromChips(note('a', ['brave', 'effort', 'passing']), 'Ollie')!.praise).toBe(
      'Well done Ollie, bravery on the ball, real effort and tidy passing today!',
    );
  });

  it('turns work-on chips into the next step', () => {
    const o = observationFromChips(note('a', ['passing', 'weak-foot', 'talk']), 'Freya')!;
    expect(o.strength).toBe('Tidy passing.');
    expect(o.nextStep).toBe('Keep working on using their weaker foot more and calling for the ball.');
  });

  it('never copies free text into child-facing fields (it can hold welfare notes or other names)', () => {
    expect(observationFromChips(note('a', [], '  dad moved out, mum Sarah Jones collected  '), 'Kai')).toEqual({
      playerId: 'a',
      strength: "Took part in today's session.",
      nextStep: 'Keep it up at the next session.',
      praise: 'Thanks for your effort today, Kai!',
    });
    // Work-on chips alone, no text: a plain, true line rather than an empty strength.
    expect(observationFromChips(note('a', ['shooting']), 'Kai')!.strength).toBe("Took part in today's session.");
  });

  it('returns null for welfare-only, unknown or empty notes', () => {
    expect(observationFromChips(note('a', ['knock']), 'Kai')).toBeNull();
    expect(observationFromChips(note('a', ['made-up']), 'Kai')).toBeNull();
    expect(observationFromChips(note('a', [], '   '), 'Kai')).toBeNull();
  });

  it('ignores unknown chips alongside known ones', () => {
    expect(observationFromChips(note('a', ['made-up', 'brave']), 'Kai')!.strength).toBe('Bravery on the ball.');
  });
});

describe('welfareFlags', () => {
  it('flags every welfare chip, and nothing else', () => {
    const nameOf = (id: string) => ({ a: 'Ollie', b: 'Amara' })[id] ?? 'Player';
    expect(welfareFlags([note('a', ['brave', 'knock', 'upset']), note('b', ['weak-foot']), note('c', ['knock'])], nameOf)).toEqual([
      { playerId: 'a', kind: 'welfare', note: 'Ollie took a knock. Check in with their parent or carer.' },
      { playerId: 'a', kind: 'welfare', note: 'Ollie seemed upset. Check in with their parent or carer.' },
      { playerId: 'c', kind: 'welfare', note: 'Player took a knock. Check in with their parent or carer.' },
    ]);
    expect(welfareFlags([], nameOf)).toEqual([]);
  });
});

describe('textWelfareFlags', () => {
  it('flags welfare words in free text, keeping the note on the phone', async () => {
    const { textWelfareFlags } = await import('../../src/lib/chips');
    const f = textWelfareFlags([note('a', [], 'Was quiet, said his dad moved out'), note('b', [], 'Great goal')], () => 'Theo');
    expect(f).toEqual([{ playerId: 'a', kind: 'welfare', note: 'Theo: your note says "Was quiet, said his dad moved out". Worth following up.' }]);
  });
});
