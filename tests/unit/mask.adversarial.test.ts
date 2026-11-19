/**
 * Adversarial tests for src/lib/mask.ts. The promise under test: no child's name,
 * nickname or recognisable fragment of one survives masking, however it is typed.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMasker, assertNoLeaks, maskDeep, unmaskDeep, fold, type MaskMember } from '../../src/lib/mask';
import { COMMON_WORD_NAMES } from '../../src/lib/commonWords';

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
  { token: 'P10', name: 'Siân' },
  { token: 'P11', name: 'Dafydd', aliases: ['Dai'] },
  { token: 'P12', name: 'Aoife' },
  { token: 'P13', name: 'Łukasz' },
  { token: 'P14', name: 'Işıl' },
  { token: 'P15', name: 'İrem' },
  { token: 'P16', name: 'Nguyễn Đức', aliases: ['Đức'] },
  { token: 'P17', name: 'محمد' },
  { token: 'P18', name: 'Søren' },
  { token: 'P19', name: 'Jo' },
  { token: 'P20', name: 'Joe' },
  { token: 'P21', name: 'Joanna' },
  { token: 'P22', name: 'Jo-Anne' },
  { token: 'P23', name: 'Thomas', aliases: ['Tom'] },
  { token: 'P24', name: 'Tom' },
  { token: 'P25', name: 'Grace' },
  { token: 'P26', name: 'Νίκος' },
  { token: 'P27', name: '小明' },
  { token: 'P28', name: 'Jess' },
  { token: 'P29', name: 'Hà' },
  { token: 'P30', name: 'Les' },
  { token: 'P31', name: 'Ash' },
  { token: 'P32', name: 'Seren' },
  { token: 'P33', name: 'Fiona' },
  { token: 'P34', name: 'Chloé' },
];
const extraTerms = ['Riverside Rovers', 'Mrs Patel', 'Ollie', 'Mrs Großmann', "St Mary's"];
const m = createMasker({ members: squad, extraTerms });

/** Masks and checks the output is leak-free before comparing. */
function masked(text: string): string {
  const r = m.mask(text);
  expect(m.findLeaks(r.text)).toEqual([]);
  return r.text;
}

describe('names from many languages, typed with and without their marks', () => {
  it.each([
    // Welsh and Irish
    ['Siân scored', '[P10] scored'],
    ['Sian scored', '[P10] scored'],
    ['SIÂN SCORED', '[P10] SCORED'],
    ['Dafydd, or Dai', '[P11], or [P11]'],
    ['Aoife and AOIFE', '[P12] and [P12]'],
    ['Ciaran ONeill', '[P07]'],
    ['Ciarán O Neill', '[P07]'],
    ['Ciarán O‛Neill', '[P07]'],
    // Polish: ł has no decomposition, people type l
    ['Łukasz', '[P13]'],
    ['Lukasz', '[P13]'],
    ['ŁUKASZ', '[P13]'],
    ['lukasz', '[P13]'],
    // Turkish dotted and dotless I
    ['Işıl', '[P14]'],
    ['Isil', '[P14]'],
    ['ISIL', '[P14]'],
    ['IŞIL', '[P14]'],
    ['ışıl', '[P14]'],
    ['İrem', '[P15]'],
    ['Irem', '[P15]'],
    ['IREM', '[P15]'],
    ['İREM', '[P15]'],
    ['irem', '[P15]'],
    // Vietnamese: đ has no decomposition, stacked tone marks do
    ['Nguyễn Đức', '[P16]'],
    ['Nguyen Duc', '[P16]'],
    ['NGUYEN DUC', '[P16]'],
    ['Đức', '[P16]'],
    ['Duc', '[P16]'],
    ['Nguyễn Đức'.normalize('NFD'), '[P16]'],
    ['Hà', '[P29]'],
    ['Ha!', '[P29]!'],
    // Arabic: vowel marks and tatweel (kashida) stretching
    ['محمد سجل', '[P17] سجل'],
    ['مُحَمَّد', '[P17]'],
    ['محـــمد', '[P17]'],
    // Danish ø
    ['Søren', '[P18]'],
    ['Soren', '[P18]'],
    ['SØREN', '[P18]'],
    // Greek final sigma: upper case folds to medial σ
    ['ΝΙΚΟΣ', '[P26]'],
    ['Νικος', '[P26]'],
    ['νίκος', '[P26]'],
    // Chinese has no spaces between words
    ['小明今天很好', '[P27]今天很好'],
    ['今天小明很好', '今天[P27]很好'],
    // German ß, both lower and capital, and ss
    ['Tell Mrs Großmann', 'Tell [X1]'],
    ['Tell Mrs Grossmann', 'Tell [X1]'],
    ['TELL MRS GROSSMANN', 'TELL [X1]'],
    ['Tell Mrs Groẞmann', 'Tell [X1]'],
    // French accent dropped or doubled
    ['Chloe', '[P34]'],
    ['CHLOÉ', '[P34]'],
    ['Chloé'.normalize('NFD'), '[P34]'],
    // ligature typed by autocorrect
    ['ﬁona', '[P33]'],
  ])('%j -> %j', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });

  it('restores the exact surface of an extra term typed with ß', () => {
    const r = m.mask('Mrs Groẞmann called');
    expect(m.unmask(r.text, r.restore)).toBe('Mrs Groẞmann called');
  });
});

describe('invisible and look-alike characters', () => {
  const invisibles = {
    'zero-width space': '​',
    'zero-width non-joiner': '‌',
    'zero-width joiner': '‍',
    'word joiner': '⁠',
    'soft hyphen': '­',
    'byte order mark': '﻿',
    'left-to-right mark': '‎',
    'bidi embedding': '‪',
    'Mongolian vowel separator': '᠎',
  };
  it.each(Object.entries(invisibles))('a %s inside a name does not split it', (_label, z) => {
    expect(masked(`Se${z}ren scored`)).toBe('[P32] scored');
    expect(masked(`O${z}l${z}l${z}i${z}e`)).toBe('[P01]');
    expect(m.findLeaks(`Se${z}ren`)).toEqual([`Se${z}ren`]);
  });
  it.each(Object.entries(invisibles))('a %s next to a name is still a word boundary', (_label, z) => {
    expect(masked(`x${z}Seren${z}y`)).toBe(`x${z}[P32]${z}y`);
  });
  it('restores an extra term with an invisible character inside to exactly what was typed', () => {
    const r = m.mask('Riverside​ Rovers away');
    expect(r.text).toBe('[X1] away');
    expect(m.unmask(r.text, r.restore)).toBe('Riverside​ Rovers away');
  });
  it('ignores combining overlays such as strikethrough and zalgo', () => {
    expect(masked('S̶e̶r̶e̶n̶')).toBe('[P32]');
    expect(masked('Ó̂̃llie')).toBe('[P01]');
  });
  it('hides full-width and mathematical styled names', () => {
    expect(masked('Ｏｌｌｉｅ scored')).toBe('[P01] scored');
    expect(masked('𝐒𝐞𝐫𝐞𝐧')).toBe('[P32]');
    expect(masked('𝘚𝘦𝘳𝘦𝘯')).toBe('[P32]');
  });
  it('treats styled capitals as capitals for everyday-word names', () => {
    expect(masked('Ｗｉｌｌ scored')).toBe('[P04] scored');
    expect(masked('𝐖𝐢𝐥𝐥 scored')).toBe('[P04] scored');
  });
  it('does not expand symbols into letters (™ stays a boundary)', () => {
    expect(masked('Ollie™ and Max®')).toBe('[P01]™ and [P02]®');
  });
  it('handles emoji, skin tones, ZWJ families and tag-sequence flags around names', () => {
    expect(masked('👨‍👩‍👧Seren👍🏽')).toBe('👨‍👩‍👧[P32]👍🏽');
    expect(masked('Dafydd🏴󠁧󠁢󠁷󠁬󠁳󠁿 and 🏴󠁧󠁢󠁷󠁬󠁳󠁿Aoife')).toBe('[P11]🏴󠁧󠁢󠁷󠁬󠁳󠁿 and 🏴󠁧󠁢󠁷󠁬󠁳󠁿[P12]');
    expect(masked('⚽️Ollie⚽️')).toBe('⚽️[P01]⚽️');
  });
  it('never throws on lone surrogates', () => {
    expect(masked('\uD800Ollie\uDC00')).toBe('\uD800[P01]\uDC00');
  });
});

describe('whitespace inside multi-word names', () => {
  it.each([
    ['Sam B', '[P08]'],
    ['Sam B', '[P08]'],
    ['Sam\tB', '[P08]'],
    ['Sam\nB', '[P08]'],
    ['Sam\r\nB', '[P08]'],
    ['Sam ​ B', '[P08]'],
    ['Ciarán\nO’Neill', '[P07]'],
    ['Riverside\t\tRovers', '[X1]'],
    ['Nguyễn　Đức', '[P16]'],
  ])('%j -> %j', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });
});

describe('position and punctuation', () => {
  const punct = [...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'];
  it.each(punct)('a name wrapped in %j is hidden', (p) => {
    expect(masked(`${p}Seren${p}`)).toBe(`${p}[P32]${p}`);
    expect(masked(`${p}seren${p}`)).toBe(`${p}[P32]${p}`);
  });
  it('hides a name that is the whole string, the start, or the end', () => {
    expect(masked('Seren')).toBe('[P32]');
    expect(masked('Seren ran')).toBe('[P32] ran');
    expect(masked('well done Seren')).toBe('well done [P32]');
  });
  it('hides every repeat of a name', () => {
    expect(masked('Ollie Ollie Ollie! ollie, OLLIE')).toBe('[P01] [P01] [P01]! [P01], [P01]');
  });
  it('hides names in hashtags, mentions and URLs', () => {
    expect(masked('#ollie @Ollie')).toBe('#[P01] @[P01]');
    expect(masked('https://instagram.com/seren_fc/ollie')).toBe('https://instagram.com/[P32]_fc/[P01]');
  });
  it('splits camelCase joins so a name inside a hashtag is hidden', () => {
    expect(masked('#OllieForCaptain #GoSeren OllieOllie')).toBe('#[P01]ForCaptain #Go[P32] [P01][P01]');
  });
  it('known limitation: an all-lowercase or all-caps joined hashtag is not split', () => {
    // There is no boundary to find without a dictionary. Product owner decision.
    expect(m.mask('#ollieforcaptain').text).toBe('#ollieforcaptain');
    expect(m.mask('#OLLIEFORCAPTAIN').text).toBe('#OLLIEFORCAPTAIN');
  });
  it('hides an email address whole, even when it starts with a name', () => {
    const r = m.mask('Mail ollie.smith@example.com or Seren@school.org.uk');
    expect(r.text).toBe('Mail [X1] or [X2]');
    expect(r.text).not.toMatch(/smith|example|school/);
    expect(m.unmask(r.text, r.restore)).toBe('Mail ollie.smith@example.com or Seren@school.org.uk');
  });
  it('hides a phone number next to a name', () => {
    const r = m.mask("Ollie's dad 07700 900123");
    expect(r.text).toBe("[P01]'s dad [X1]");
  });
});

describe('names that contain each other', () => {
  it.each([
    ['Jo', '[P19]'],
    ['Joe', '[P20]'],
    ['Joanna', '[P21]'],
    ['Jo-Anne', '[P22]'],
    ['Jo–Anne', '[P22]'],
    ['Jo Anne', '[P22]'],
    ['JoAnne', '[P22]'],
    ['Joanne', '[P22]'],
    ['Jo, Joe, Joanna and Jo-Anne', '[P19], [P20], [P21] and [P22]'],
    ["Jo's and Joe's", "[P19]'s and [P20]'s"],
    ['Jos', 'Jos'], // two-letter names never take a bare plural s (owner decision 19 Nov)
    ['Joes', '[P20]s'],
    ['Johanna stays', 'Johanna stays'],
    ['Mary Jane', '[P05]'],
    ['MaryJane', '[P05]'],
    ['Mary-Jane', '[P05]'],
    ["St Mary's", '[X1]'],
    ['St Marys', '[X1]'],
  ])('%j -> %j', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });
  it('a nickname equal to another child`s name is ambiguous and restores as typed', () => {
    const r = m.mask('Tom and Thomas');
    expect(r.text).toBe('[A1] and [P23]');
    expect(r.restore).toEqual({ '[A1]': 'Tom' });
    expect(m.unmask(r.text, r.restore)).toBe('Tom and Thomas');
  });
  it('an alias identical to an extra hidden term is still the child', () => {
    expect(m.mask('Ollie').hits).toEqual([{ token: 'P01', surface: 'Ollie', kind: 'player' }]);
  });
  it('an alias and a hidden term that differ only by punctuation merge into one ambiguous token', () => {
    const mm = createMasker({ members: [{ token: 'P01', name: "D'Arcy" }, { token: 'P02', name: 'Darcy' }] });
    expect(mm.mask("Darcy and D'Arcy").text).toBe('[A1] and [P01]');
  });
});

describe('plurals and possessives without an apostrophe', () => {
  it.each([
    ['Ollies boots', '[P01]s boots'],
    ['ollies boots', '[P01]s boots'],
    ['serens pass', '[P32]s pass'],
    ['the two Maxes', 'the two [P02]es'],
    ['the Jesses', 'the [P28]es'],
    ['Ashes', '[P31]es'],
    ['Wills shot', '[P04]s shot'],
    ['OLLIES', '[P01]S'],
  ])('hides %j -> %j', (input, expected) => {
    expect(masked(input)).toBe(expected);
  });
  it.each([
    'he has the ball',
    'run less, pass more',
    'Less running next week',
    'the ashes of the bonfire',
    'he wills it in',
    'maxes out',
    'jesses',
    'jos',
  ])('leaves ordinary words alone: %j', (input) => {
    expect(m.mask(input).text).toBe(input);
  });
  it('owner decision: a two-letter name plus s is a different word, so "Has" is left alone', () => {
    expect(m.mask('Has he trained?').text).toBe('Has he trained?');
  });
});

describe('everyday-word names (documented trade-off)', () => {
  it.each([
    ['will', 'will'],
    ['Will', '[P04]'],
    ['WILL', '[P04]'],
    ["Will's", "[P04]'s"],
    ['grace under pressure', 'grace under pressure'],
    ['Grace', '[P25]'],
    ['GRACE', '[P25]'],
    ['max effort', 'max effort'],
    ['Max', '[P02]'],
    ['MAX', '[P02]'],
  ])('%j -> %j', (input, expected) => {
    expect(m.mask(input).text).toBe(expected);
  });
  it('a sentence-initial everyday word is hidden (over-masking is the safe side)', () => {
    expect(m.mask('Will we win? Grace was shown.').text).toBe('[P04] we win? [P25] was shown.');
  });
  it('wIll (lowercase first letter) is treated as the word', () => {
    expect(m.mask('wIll').text).toBe('wIll');
  });
  it('every common-word entry is already folded, so it can match', () => {
    for (const w of COMMON_WORD_NAMES) expect(fold(w).text).toBe(w);
  });
  it('every common-word name is hidden when capitalised and left alone in lowercase', () => {
    for (const w of COMMON_WORD_NAMES) {
      const cap = w[0].toUpperCase() + w.slice(1);
      const mm = createMasker({ members: [{ token: 'P01', name: cap }] });
      expect(mm.mask(`${cap} and ${w.toUpperCase()}`).text).toBe('[P01] and [P01]');
      expect(mm.mask(`then ${w} again`).text).toBe(`then ${w} again`);
    }
  });
});

describe('token injection', () => {
  it.each(['[P04]', '[p04]', '[ P04 ]', '[A1]', '[a1]', '[X1]', '[x1]', '[P999]'])(
    'a coach-typed %j cannot become a real token',
    (t) => {
      const shared: Record<string, string> = { '[A1]': 'Sam', '[X1]': 'Riverside Rovers' };
      const r = m.mask(`note ${t} here`, shared);
      expect(r.text).not.toMatch(/\[\s*[PAX]\d+\s*\]/i);
      const back = m.unmask(r.text, r.restore);
      expect(back).not.toMatch(/Will|Sam|Riverside/);
    },
  );
  it('names inside coach-typed brackets are still hidden', () => {
    expect(masked('[Ollie] and [ Seren ]')).toBe('[[P01]] and [ [P32] ]');
  });
  it('owner decision: a bare token typed by the coach (P04) is neutralised so it can never restore to a child', () => {
    const r = m.mask('Cones on pitch P04');
    expect(r.text).toBe('Cones on pitch #P04');
    expect(m.unmask(r.text, r.restore)).toBe('Cones on pitch #P04');
  });
});

describe('unmask: model output variations', () => {
  const restore = { '[A1]': 'Sam', '[X1]': 'Riverside Rovers' };
  it.each([
    ['[p03] played well', 'Zoë played well'],
    ['[P03]’s pass', 'Zoë’s pass'],
    ["[P03]'s pass", "Zoë's pass"],
    ['[P03]s boots', 'Zoës boots'],
    ['{"player":"[P03]","note":"[A1] and [X1]"}', '{"player":"Zoë","note":"Sam and Riverside Rovers"}'],
    ['[  P03  ] and [ a1 ]', 'Zoë and Sam'],
    ['([P03]), [P03]. [P03]! [P03]? [P03]: "[P03]"', '(Zoë), Zoë. Zoë! Zoë? Zoë: "Zoë"'],
    ['**[P03]** and _[P01]_', '**Zoë** and _Ollie_'],
    ['[[P03]]', '[Zoë]'],
    ["P03's run, P01.", "Zoë's run, Ollie."],
    ['- P03: great', '- Zoë: great'],
    ['[P99] and [A9] and [X9]', '[P99] and [A9] and [X9]'],
    ['P03s', 'P03s'],
    ['#P03', '#P03'],
  ])('%j -> %j', (input, expected) => {
    expect(m.unmask(input, restore)).toBe(expected);
  });
});

describe('shared restore maps across fields', () => {
  it('keeps tokens consistent across several mask(text, shared) calls', () => {
    const shared: Record<string, string> = {};
    const a = m.mask('Sam and Riverside Rovers', shared);
    const b = m.mask('sam, Sam, ollie.smith@example.com', shared);
    const c = m.mask('Riverside Rovers again, Tom', shared);
    expect(a.text).toBe('[A1] and [X1]');
    expect(b.text).toBe('[A2], [A1], [X2]');
    expect(c.text).toBe('[X1] again, [A3]');
    expect(shared).toEqual({
      '[A1]': 'Sam',
      '[X1]': 'Riverside Rovers',
      '[A2]': 'sam',
      '[X2]': 'ollie.smith@example.com',
      '[A3]': 'Tom',
    });
    expect([a, b, c].map((r) => m.unmask(r.text, shared))).toEqual([
      'Sam and Riverside Rovers',
      'sam, Sam, ollie.smith@example.com',
      'Riverside Rovers again, Tom',
    ]);
  });
  it('continues numbering after gaps in a pre-filled map', () => {
    const shared: Record<string, string> = { '[X5]': 'old', '[A3]': 'old' };
    expect(m.mask('Mrs Patel and Sam', shared).text).toBe('[X6] and [A4]');
  });
  it('maskDeep hides names used as object keys and unmaskDeep restores them', () => {
    const restore: Record<string, string> = {};
    const input = { Seren: 'scored', attendance: { Ollie: true, sam: false }, notes: ['Ollie passed to Seren'] };
    const out = maskDeep(m, input, restore);
    expect(out).toEqual({ '[P32]': 'scored', attendance: { '[P01]': true, '[A1]': false }, notes: ['[P01] passed to [P32]'] });
    expect(m.findLeaks(JSON.stringify(out))).toEqual([]);
    expect(unmaskDeep(m, out, restore)).toEqual(input);
    expect(input.Seren).toBe('scored'); // input not mutated
  });
});

describe('leak detection on raw text', () => {
  it.each(['Se​ren', 'Ｏｌｌｉｅ', 'Isil', 'Lukasz', 'MaryJane', 'ollies', '#GoSeren', 'seren@x.com'])(
    'findLeaks and assertNoLeaks catch %j',
    (raw) => {
      expect(m.findLeaks(raw).length).toBeGreaterThan(0);
      expect(() => assertNoLeaks(m, raw)).toThrow();
      expect(() => assertNoLeaks(m, m.mask(raw).text)).not.toThrow();
    },
  );
});

describe('config hardening', () => {
  it('ignores aliases with no letters or digits so punctuation is never masked', () => {
    const mm = createMasker({ members: [{ token: 'P01', name: 'Ollie', aliases: ['--', "''", '..'] }] });
    expect(mm.mask('a -- b .. c Ollie').text).toBe('a -- b .. c [P01]');
  });
});

describe('performance on 100k-character input', () => {
  const big: Record<string, string> = {
    'one long word': 'a'.repeat(100_000),
    'dotted run (email-like)': 'a.'.repeat(50_000),
    'digits and spaces (phone-like)': '1 '.repeat(50_000) + 'a',
    'many @ signs': 'a@'.repeat(50_000),
    'names everywhere': 'Ollie passed to Seren, Max and Sam​. '.repeat(2_600),
    'non-Latin text': 'Zoë café Işıl 小明 محمد 😀 '.repeat(4_000),
  };
  // Best of three, so a busy CI worker does not fail the test; quadratic code takes seconds.
  it.each(Object.keys(big))('%s masks and leak-checks in under 200 ms', (k) => {
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const t = performance.now();
      const r = m.mask(big[k]);
      m.findLeaks(r.text);
      best = Math.min(best, performance.now() - t);
    }
    expect(best).toBeLessThan(200);
  });
});

// Property tests with richer generators.
const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
const zws = ['​', '‌', '‍', '­', '⁠', '﻿'];
const baseNames = ['Ollie', 'Oliver', 'Max', 'Zoë', 'Mary-Jane', 'Mary', "Ciarán O'Neill", 'Sam', 'Siân', 'Łukasz', 'Işıl', 'İrem', 'Nguyễn Đức', 'Søren', 'Jo', 'Joe', 'Joanna', 'Jo-Anne', 'Thomas', 'Tom', 'Νίκος', 'Jess', 'Seren', 'Riverside Rovers', 'Mrs Patel'];
const nameVariant = fc
  .tuple(
    fc.constantFrom(...baseNames),
    fc.constantFrom('as-is', 'lower', 'upper', 'plain', 'nfd', 'fullwidth', 'zw', 'possessive', 'curly'),
    fc.nat(),
  )
  .map(([n, how, seed]) => {
    switch (how) {
      case 'lower':
        return n.toLowerCase();
      case 'upper':
        return n.toUpperCase();
      case 'plain':
        return stripMarks(n).replace(/ł/g, 'l').replace(/ı/g, 'i').replace(/ø/g, 'o').replace(/đ/gi, 'd');
      case 'nfd':
        return n.normalize('NFD');
      case 'fullwidth':
        return [...n].map((c) => (/[A-Za-z]/.test(c) ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c)).join('');
      case 'zw': {
        const i = 1 + (seed % Math.max(1, n.length - 1));
        return n.slice(0, i) + zws[seed % zws.length] + n.slice(i);
      }
      case 'possessive':
        return n + "'s";
      case 'curly':
        return n.replace(/'/g, '’').replace(/-/g, '–');
      default:
        return n;
    }
  });
const filler = fc.constantFrom('passed', 'to', 'great', 'maximum', 'will', 'mark', 'grace', 'has', 'less', 'the', 'ball', 'Johanna', 'café', '3-2', '小', '😀', '👨‍👩‍👧');
const sep = fc.constantFrom(' ', ', ', '. ', '\n', '\t', ' ', ' - ', '!', '?', '"', '(', ')', '#', '@', '/', ':', ';', '*', '_', '​');
const richNote = fc
  .array(fc.tuple(fc.oneof(nameVariant, filler), sep), { maxLength: 30 })
  .map((parts) => parts.map(([w, s]) => w + s).join(''));

describe('properties (rich generators)', () => {
  it('masked text never leaks a name, however it is typed', () => {
    fc.assert(
      fc.property(richNote, (t) => {
        expect(m.findLeaks(m.mask(t).text)).toEqual([]);
      }),
      { numRuns: 3000 },
    );
  });
  it('mask -> unmask -> mask is stable', () => {
    fc.assert(
      fc.property(richNote, (t) => {
        const r = m.mask(t);
        expect(m.mask(m.unmask(r.text, r.restore)).text).toBe(r.text);
      }),
      { numRuns: 2000 },
    );
  });
  it('unmask leaves no squad tokens behind', () => {
    fc.assert(
      fc.property(richNote, (t) => {
        const r = m.mask(t);
        expect(m.unmask(r.text, r.restore)).not.toMatch(/\[(P\d{2,3}|A\d+|X\d+)\]/);
      }),
      { numRuns: 1000 },
    );
  });
  it('text with only ambiguous names and hidden words round-trips exactly', () => {
    const word = fc.constantFrom('Sam', 'sam', 'SAM', 'Tom', 'Riverside Rovers', 'Mrs Patel', 'Mrs Großmann', 'the', 'ball', 'will');
    fc.assert(
      fc.property(fc.array(fc.tuple(word, sep), { maxLength: 20 }), (parts) => {
        const t = parts.map(([w, s]) => w + s).join('');
        const r = m.mask(t);
        expect(m.unmask(r.text, r.restore)).toBe(t);
      }),
      { numRuns: 1000 },
    );
  });
  it('a name with random invisible characters inside, in random unicode junk, never leaks', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary', maxLength: 100 }),
        fc.constantFrom(...baseNames),
        fc.array(fc.constantFrom(...zws), { maxLength: 3 }),
        (junk, name, zs) => {
          const chars = [...name];
          zs.forEach((z, k) => chars.splice(1 + (k % (chars.length - 1)), 0, z));
          const r = m.mask(`${junk} ${chars.join('')} ${junk}`);
          expect(m.findLeaks(r.text)).toEqual([]);
        },
      ),
      { numRuns: 2000 },
    );
  });
  it('fold keeps one map entry per folded unit, in order and in range', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (s) => {
        const f = fold(s);
        expect(f.map.length).toBe(f.text.length);
        for (let i = 0; i < f.map.length; i++) {
          expect(f.map[i]).toBeGreaterThanOrEqual(i ? f.map[i - 1] : 0);
          expect(f.map[i]).toBeLessThan(s.length);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
