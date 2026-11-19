import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMasker, assertNoLeaks, LeakError, maskDeep, unmaskDeep, fold, type MaskMember } from '../../src/lib/mask';

const squad: MaskMember[] = [
  { token: 'P01', name: 'Ollie', aliases: ['Oliver', 'Ol'] },
  { token: 'P02', name: 'Max' },
  { token: 'P03', name: 'Zoë' },
  { token: 'P04', name: 'Will' },
  { token: 'P05', name: 'Mary-Jane', aliases: ['MJ'] },
  { token: 'P06', name: 'Mary' },
  { token: 'P07', name: "Ciarán O'Neill", aliases: ['Ciarán', 'Kieran'] },
  { token: 'P08', name: 'Sam B', aliases: ['Sam'] },
  { token: 'P09', name: 'Sam K', aliases: ['Sam'] },
  { token: 'P10', name: 'Eve' },
  { token: 'P11', name: 'Ali' },
  { token: 'P12', name: 'Seren' },
];
const m = createMasker({ members: squad, extraTerms: ['Riverside Rovers', 'Mrs Patel'] });

describe('mask: whole words and substrings', () => {
  it('hides a name but not words that contain it', () => {
    const r = m.mask('Max gave maximum effort. Ali showed real quality. Every drill, Eve was everywhere.');
    expect(r.text).toBe('[P02] gave maximum effort. [P11] showed real quality. Every drill, [P10] was everywhere.');
  });
  it('hides lowercase names typed in a hurry', () => {
    expect(m.mask('ollie and seren and zoe').text).toBe('[P01] and [P12] and [P03]');
  });
  it('is accent-insensitive both ways', () => {
    expect(m.mask('Zoe, ZOË, zoë, Zoë').text).toBe('[P03], [P03], [P03], [P03]');
    expect(m.mask('Ciaran and Ciarán').text).toBe('[P07] and [P07]');
  });
  it('handles decomposed (NFD) input', () => {
    expect(m.mask('Zoë scored').text).toBe('[P03] scored');
  });
  it('handles possessives with straight and curly apostrophes', () => {
    expect(m.mask("Ollie's touch, Ollie’s pass").text).toBe("[P01]'s touch, [P01]’s pass");
  });
  it('hides a capitalised plural without apostrophe', () => {
    expect(m.mask('Ollies best game').text).toBe('[P01]s best game');
  });
  it('hides nicknames and full names as the same child', () => {
    expect(m.mask('Oliver, Ol and Ollie').text).toBe('[P01], [P01] and [P01]');
  });
  it('prefers the longest match (Mary-Jane over Mary)', () => {
    expect(m.mask('Mary-Jane passed to Mary').text).toBe('[P05] passed to [P06]');
    expect(m.mask('Mary–Jane (en dash)').text).toBe('[P05] (en dash)');
  });
  it('falls back to a shorter name when the longer one is part of another word', () => {
    expect(m.mask('Mary-Janet').text).toBe('[P06]-Janet');
  });
  it('matches names with apostrophes and spaces, tolerating extra whitespace', () => {
    expect(m.mask("Ciarán O’Neill and Ciarán  O'Neill").text).toBe('[P07] and [P07]');
  });
  it('treats digits next to a name as a boundary', () => {
    expect(m.mask('Ollie2 and 7Max').text).toBe('[P01]2 and 7[P02]');
  });
});

describe('mask: everyday-word names', () => {
  it('hides capitalised Will but leaves the verb', () => {
    expect(m.mask('Will was brave. He will need to tuck in.').text).toBe('[P04] was brave. He will need to tuck in.');
  });
  it('hides WILL in capitals', () => {
    expect(m.mask('WILL!!').text).toBe('[P04]!!');
  });
  it('max effort stays readable but Max is hidden', () => {
    expect(m.mask('max effort from Max').text).toBe('max effort from [P02]');
  });
});

describe('mask: duplicates', () => {
  it('gives a shared first name an ambiguous token that restores to what was typed', () => {
    const r = m.mask('Sam and sam both scored, Sam B assisted');
    expect(r.text).toBe('[A1] and [A2] both scored, [P08] assisted');
    expect(r.restore).toEqual({ '[A1]': 'Sam', '[A2]': 'sam' });
    expect(m.unmask(r.text, r.restore)).toBe('Sam and sam both scored, Sam B assisted');
  });
  it('reuses the same ambiguous token for the same surface', () => {
    const r = m.mask('Sam, then Sam again');
    expect(r.text).toBe('[A1], then [A1] again');
  });
});

describe('mask: extra hidden words, emails, phones', () => {
  it('hides extra terms and restores them', () => {
    const r = m.mask('Riverside Rovers away. Tell Mrs Patel.');
    expect(r.text).toBe('[X1] away. Tell [X2].');
    expect(m.unmask(r.text, r.restore)).toBe('Riverside Rovers away. Tell Mrs Patel.');
  });
  it('hides emails and phone numbers', () => {
    const r = m.mask('Mum: jo.parent@example.com, 07700 900123 or +44 (0)7700-900124');
    expect(r.text).not.toMatch(/example\.com|900123|900124/);
    expect(m.unmask(r.text, r.restore)).toBe('Mum: jo.parent@example.com, 07700 900123 or +44 (0)7700-900124');
  });
  it('leaves scores, dates and short numbers alone', () => {
    const t = 'Won 3-2 on 19/11/2026 at 10:00, 12 kids, 2026-11-19';
    expect(m.mask(t).text).toBe(t);
  });
});

describe('mask: token injection', () => {
  it('neutralises tokens the coach typed so they cannot be confused with real ones', () => {
    const r = m.mask('Note [P04] and [A1]');
    expect(r.text).toBe('Note #P04 and #A1');
    expect(m.unmask(r.text, r.restore)).toBe('Note #P04 and #A1');
  });
});

describe('unmask', () => {
  it('restores tokens, possessives and bare tokens from model output', () => {
    expect(m.unmask("[P01]'s first touch; P02 was great; [ P03 ] too")).toBe("Ollie's first touch; Max was great; Zoë too");
  });
  it('leaves unknown tokens alone', () => {
    expect(m.unmask('[P77] and [A9]')).toBe('[P77] and [A9]');
  });
  it('does not touch tokens inside words', () => {
    expect(m.unmask('XP01 P01X')).toBe('XP01 P01X');
  });
});

describe('findLeaks / assertNoLeaks', () => {
  it('finds names in unmasked text and passes masked text', () => {
    const raw = 'Ollie and Riverside Rovers, call 07700 900123';
    expect(m.findLeaks(raw).sort()).toEqual(['07700 900123', 'Ollie', 'Riverside Rovers'].sort());
    expect(m.findLeaks(m.mask(raw).text)).toEqual([]);
    expect(() => assertNoLeaks(m, raw)).toThrow(LeakError);
    expect(() => assertNoLeaks(m, m.mask(raw).text)).not.toThrow();
  });
  it('catches a name hidden in a JSON payload', () => {
    const payload = JSON.stringify({ a: 'fine', b: ['also fine', 'zoë did well'] });
    expect(m.findLeaks(payload)).toEqual(['zoë']);
  });
});

describe('maskDeep / unmaskDeep', () => {
  it('masks every string in an object with consistent tokens across fields', () => {
    const restore: Record<string, string> = {};
    const out = maskDeep(m, { a: 'Sam', b: ['sam', { c: 'Sam' }], n: 3, t: true, z: null }, restore);
    expect(out).toEqual({ a: '[A1]', b: ['[A2]', { c: '[A1]' }], n: 3, t: true, z: null });
    expect(unmaskDeep(m, out, restore)).toEqual({ a: 'Sam', b: ['sam', { c: 'Sam' }], n: 3, t: true, z: null });
  });
});

describe('config validation', () => {
  it('rejects a bad token', () => {
    expect(() => createMasker({ members: [{ token: 'X1', name: 'Bad' }] })).toThrow();
  });
  it('ignores one-letter names and empty aliases', () => {
    const mm = createMasker({ members: [{ token: 'P01', name: 'J', aliases: ['', ' '] }] });
    expect(mm.mask('J and a').text).toBe('J and a');
  });
  it('works with an empty squad', () => {
    const mm = createMasker({ members: [] });
    expect(mm.mask('hello Ollie').text).toBe('hello Ollie');
    expect(mm.findLeaks('hello')).toEqual([]);
  });
});

describe('fold', () => {
  it('maps folded indices back to the original', () => {
    const f = fold('Zoë’s  pass');
    expect(f.text).toBe("zoe's pass");
    expect(f.map.length).toBe(f.text.length);
  });
});

// Property tests: random notes built from squad names, everyday words and punctuation.
const words = ['passed', 'to', 'great', 'first', 'touch', 'maximum', 'quality', 'every', 'will', 'mark', 'brave', 'the', 'ball', 'and'];
const names = ['Ollie', 'ollie', 'Oliver', 'Max', 'Zoë', 'ZOE', 'Will', 'Mary-Jane', 'Mary', "Ciarán O'Neill", 'Sam', 'Sam B', 'Eve', 'Ali', 'Seren', 'Riverside Rovers'];
const seps = [' ', ', ', '. ', "'s ", '! ', '\n', ' - '];
const note = fc
  .array(fc.tuple(fc.oneof(fc.constantFrom(...words), fc.constantFrom(...names)), fc.constantFrom(...seps)), { maxLength: 30 })
  .map((parts) => parts.map(([w, s]) => w + s).join(''));

describe('properties', () => {
  it('mask then unmask restores the original text, modulo player display names', () => {
    fc.assert(
      fc.property(note, (t) => {
        const r = m.mask(t);
        const back = m.unmask(r.text, r.restore);
        // Re-masking the restored text gives the same masked text.
        expect(m.mask(back).text).toBe(r.text);
      }),
      { numRuns: 2000 },
    );
  });
  it('masked text never leaks a name', () => {
    fc.assert(
      fc.property(note, (t) => {
        expect(m.findLeaks(m.mask(t).text)).toEqual([]);
      }),
      { numRuns: 2000 },
    );
  });
  it('arbitrary unicode input never throws and never leaks', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), fc.constantFrom(...names), (junk, name) => {
        const r = m.mask(`${junk} ${name} ${junk}`);
        expect(m.findLeaks(r.text)).toEqual([]);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('owner decisions (19 Nov)', () => {
  const mm = createMasker({ members: [{ token: 'P01', name: 'Hà' }, { token: 'P02', name: 'Will' }] });
  it('does not turn "Has" into a token for a two-letter name', () => {
    expect(mm.mask('Has he trained? Hà did.').text).toBe('Has he trained? [P01] did.');
  });
  it('neutralises a bare token typed by the coach so it cannot come back as a name', () => {
    const r = mm.mask('Use pitch P02 next week');
    expect(r.text).toBe('Use pitch #P02 next week');
    expect(mm.unmask(r.text, r.restore)).toBe('Use pitch #P02 next week');
  });
});
