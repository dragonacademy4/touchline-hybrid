import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  extractJson,
  PARENT_UPDATE_SCHEMA,
  ParseError,
  parseParentUpdate,
  parseProgress,
  parseSession,
  PROGRESS_SCHEMA,
  SESSION_SCHEMA,
} from '../../src/lib/schema';

const allowed = new Set(['P01', 'P02', 'P03', 'P123']);
const j = (v: unknown) => JSON.stringify(v);

function parseErrorOf(fn: () => unknown): ParseError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ParseError);
    return e as ParseError;
  }
  throw new Error('expected a ParseError');
}

describe('schemas', () => {
  it('require every field the parsers read', () => {
    expect(SESSION_SCHEMA.required).toEqual(['players', 'summary', 'flags']);
    expect(SESSION_SCHEMA.properties.players.items.required).toEqual(['player', 'strength', 'nextStep', 'praise']);
    expect(PARENT_UPDATE_SCHEMA.required).toEqual(['title', 'message', 'players']);
    expect(PROGRESS_SCHEMA.required).toEqual(['headline', 'progress', 'strengths', 'focus', 'homeIdea']);
  });
});

describe('extractJson', () => {
  it('parses plain JSON, with surrounding whitespace', () => {
    expect(extractJson('  {"a":1}\n')).toEqual({ a: 1 });
    expect(extractJson('[1,2]')).toEqual([1, 2]);
  });
  it('parses fenced JSON, with or without a language tag', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```JSON {"a":2} ```')).toEqual({ a: 2 });
    expect(extractJson('Here you go:\n```\n{"a":3}\n```\nAnything else?')).toEqual({ a: 3 });
  });
  it('finds an object inside chatter', () => {
    expect(extractJson('Sure! {"a":{"b":[1]}} Hope that helps.')).toEqual({ a: { b: [1] } });
  });
  it('falls back to braces when the fence holds invalid JSON', () => {
    expect(extractJson('```json\n// the notes\n{"a":4}\n```')).toEqual({ a: 4 });
  });
  it.each(['', 'not json', '{"a":', '}{', '```json\n{oops}\n```', 'Sorry, I cannot help with that.'])('throws ParseError on %j', (raw) => {
    const e = parseErrorOf(() => extractJson(raw));
    expect(e.raw).toBe(raw);
    expect(e.name).toBe('ParseError');
  });
});

describe('parseSession', () => {
  const entry = (player: unknown, strength = 'Good', nextStep = 'Next', praise = 'Well done') => ({ player, strength, nextStep, praise });

  it('keeps allowed tokens, normalising the format', () => {
    const r = parseSession(j({ players: [entry('[p01]'), entry(' P02 '), entry('[ P03 ]'), entry('p123')], summary: 's', flags: [] }), allowed);
    expect(r.players.map((p) => p.token)).toEqual(['P01', 'P02', 'P03', 'P123']);
  });

  it('drops unknown, malformed and duplicate tokens', () => {
    const r = parseSession(
      j({
        players: [entry('P01', 'first'), entry('P01', 'second'), entry('P99'), entry('Ollie'), entry('P1'), entry('P1234'), entry('P01 P02'), entry(3), entry(null), 'junk', null],
        summary: '',
      }),
      allowed,
    );
    expect(r.players).toEqual([{ token: 'P01', strength: 'first', nextStep: 'Next', praise: 'Well done' }]);
  });

  it('skips empty entries without blocking a later good one for the same token', () => {
    const r = parseSession(j({ players: [entry('P01', '', '', ''), entry('P01', 'Real')] }), allowed);
    expect(r.players).toEqual([{ token: 'P01', strength: 'Real', nextStep: 'Next', praise: 'Well done' }]);
  });

  it('accepts next_step, collapses whitespace and ignores non-string fields', () => {
    const r = parseSession(j({ players: [{ player: 'P02', strength: '  Big \n\t effort ', next_step: 'Talk  more', praise: 42 }] }), allowed);
    expect(r.players[0]).toEqual({ token: 'P02', strength: 'Big effort', nextStep: 'Talk more', praise: '' });
    // camelCase wins when both are present
    const both = parseSession(j({ players: [{ player: 'P02', strength: 'x', nextStep: 'camel', next_step: 'snake' }] }), allowed);
    expect(both.players[0].nextStep).toBe('camel');
  });

  it('truncates long sentences and the summary with an ellipsis', () => {
    const r = parseSession(j({ players: [entry('P01', 'word '.repeat(200))], summary: 'x'.repeat(5000) }), allowed);
    expect(r.players[0].strength.length).toBeLessThanOrEqual(400);
    expect(r.players[0].strength.endsWith('word…')).toBe(true);
    expect(r.summary).toHaveLength(1500);
    expect(r.summary.endsWith('…')).toBe(true);
    const exact = parseSession(j({ summary: 'y'.repeat(1500) }), allowed);
    expect(exact.summary).toBe('y'.repeat(1500));
  });

  it('parses flags: blank notes dropped, unknown or empty tokens become group flags', () => {
    const r = parseSession(
      j({
        summary: 'ok',
        flags: [
          { player: 'P01', note: ' Took a knock ' },
          { player: '', note: 'Missing kit' },
          { player: 'P99', note: 'Unknown child' },
          { note: 'No player field' },
          { player: 'P02', note: '   ' },
          { player: 'P02' },
          'junk',
        ],
      }),
      allowed,
    );
    expect(r.flags).toEqual([
      { token: 'P01', note: 'Took a knock' },
      { token: null, note: 'Missing kit' },
      { token: null, note: 'Unknown child' },
      { token: null, note: 'No player field' },
    ]);
  });

  it('tolerates missing or wrongly typed arrays', () => {
    expect(parseSession(j({ summary: 'Only a summary' }), allowed)).toEqual({ players: [], summary: 'Only a summary', flags: [] });
    expect(parseSession(j({ summary: 'x', players: 'P01', flags: {} }), allowed)).toEqual({ players: [], summary: 'x', flags: [] });
  });

  it.each(['{}', j({ players: [], summary: '  ', flags: [{ player: 'P01', note: 'knock' }] }), 'null', '42', '[]', '"text"', j({ players: [entry('P99')] })])(
    'throws ParseError when nothing usable comes back: %s',
    (raw) => {
      expect(parseErrorOf(() => parseSession(raw, allowed)).raw).toBe(raw);
    },
  );

  it('throws ParseError when no tokens are allowed', () => {
    expect(() => parseSession(j({ players: [entry('P01')] }), new Set())).toThrow(ParseError);
  });
});

describe('parseParentUpdate', () => {
  it('parses title, message and allowed player lines', () => {
    const r = parseParentUpdate(
      j({
        title: ' Week  one ',
        message: 'Great week.',
        players: [
          { player: '[p01]', line: 'Lovely passing' },
          { player: 'P01', line: 'Duplicate' },
          { player: 'P02', line: '  ' },
          { player: 'P02', line: 'Second try' },
          { player: 'P77', line: 'Unknown' },
          { player: 'Freya', line: 'Name, not token' },
          null,
        ],
      }),
      allowed,
    );
    expect(r).toEqual({
      title: 'Week one',
      message: 'Great week.',
      players: [
        { token: 'P01', line: 'Lovely passing' },
        { token: 'P02', line: 'Second try' },
      ],
    });
  });

  it('defaults the title and truncates long text', () => {
    const r = parseParentUpdate(j({ message: 'm'.repeat(3000), title: '', players: 'x' }), allowed);
    expect(r.title).toBe('This week at training');
    expect(r.message).toHaveLength(1500);
    expect(r.players).toEqual([]);
    expect(parseParentUpdate(j({ message: 'm', title: 't'.repeat(500) }), allowed).title).toHaveLength(120);
    expect(parseParentUpdate(j({ message: 'm', title: 7 }), allowed).title).toBe('This week at training');
  });

  it.each(['{}', j({ title: 'Hi', message: ' ' }), j({ message: 5 }), 'nope'])('throws ParseError on an empty message: %s', (raw) => {
    expect(() => parseParentUpdate(raw, allowed)).toThrow(ParseError);
  });
});

describe('parseProgress', () => {
  it('parses every field', () => {
    const r = parseProgress(j({ headline: 'Up', progress: 'Better.', strengths: ['Pace', 'Touch'], focus: 'Left foot', homeIdea: 'Wall passes' }));
    expect(r).toEqual({ headline: 'Up', progress: 'Better.', strengths: ['Pace', 'Touch'], focus: 'Left foot', homeIdea: 'Wall passes' });
  });

  it('accepts home_idea, but prefers homeIdea', () => {
    expect(parseProgress(j({ progress: 'p', home_idea: 'Juggle' })).homeIdea).toBe('Juggle');
    expect(parseProgress(j({ progress: 'p', homeIdea: 'A', home_idea: 'B' })).homeIdea).toBe('A');
  });

  it('cleans strengths: strings only, max 5, 80 chars each', () => {
    const r = parseProgress(j({ progress: 'p', strengths: ['a', 1, null, '  ', 'b', 'c', 'd', 'e', 'f', 's'.repeat(200)] }));
    expect(r.strengths).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(parseProgress(j({ progress: 'p', strengths: ['s'.repeat(200)] })).strengths[0]).toHaveLength(80);
    expect(parseProgress(j({ progress: 'p', strengths: 'Pace' })).strengths).toEqual([]);
  });

  it('fills missing optional fields with empty strings', () => {
    expect(parseProgress(j({ progress: 'p' }))).toEqual({ headline: '', progress: 'p', strengths: [], focus: '', homeIdea: '' });
  });

  it.each(['{}', j({ headline: 'x', progress: '' }), '[]', 'garbage'])('throws ParseError when progress is empty: %s', (raw) => {
    expect(() => parseProgress(raw)).toThrow(ParseError);
  });
});

describe('parsers: properties', () => {
  const token = fc.oneof(
    fc.constantFrom('P01', '[p02]', ' P03 ', 'P123', 'P99', 'Ollie', '', 'P1'),
    fc.string(),
    fc.integer(),
  );
  const fuzzValue = fc.oneof(fc.string(), fc.jsonValue(), token);
  const shaped = fc.record(
    {
      players: fc.oneof(fc.array(fc.oneof(fc.record({ player: token, strength: fuzzValue, nextStep: fuzzValue, next_step: fuzzValue, praise: fuzzValue, line: fuzzValue }, { requiredKeys: [] }), fc.jsonValue())), fc.jsonValue()),
      summary: fuzzValue,
      flags: fc.oneof(fc.array(fc.record({ player: token, note: fuzzValue }, { requiredKeys: [] })), fc.jsonValue()),
      title: fuzzValue,
      message: fuzzValue,
      headline: fuzzValue,
      progress: fuzzValue,
      strengths: fc.oneof(fc.array(fuzzValue), fuzzValue),
      focus: fuzzValue,
      homeIdea: fuzzValue,
      home_idea: fuzzValue,
    },
    { requiredKeys: [] },
  );
  const raw = fc.oneof(
    fc.string(),
    fc.string({ unit: 'grapheme' }),
    fc.json(),
    shaped.map((v) => JSON.stringify(v)),
    shaped.map((v) => '```json\n' + JSON.stringify(v) + '\n```'),
    fc.tuple(fc.string(), shaped, fc.string()).map(([a, v, b]) => `${a} ${JSON.stringify(v)} ${b}`),
  );

  function onlyParseError(fn: () => unknown) {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
    }
  }

  it('never throw anything except ParseError', () => {
    fc.assert(
      fc.property(raw, (r) => {
        onlyParseError(() => extractJson(r));
        onlyParseError(() => parseSession(r, allowed));
        onlyParseError(() => parseParentUpdate(r, allowed));
        onlyParseError(() => parseProgress(r));
      }),
      { numRuns: 1500 },
    );
  });

  it('only ever return allowed, unique tokens and bounded text', () => {
    fc.assert(
      fc.property(shaped.map((v) => JSON.stringify(v)), (r) => {
        try {
          const s = parseSession(r, allowed);
          const toks = s.players.map((p) => p.token);
          expect(new Set(toks).size).toBe(toks.length);
          for (const p of s.players) {
            expect(allowed.has(p.token)).toBe(true);
            for (const t of [p.strength, p.nextStep, p.praise]) expect(t.length).toBeLessThanOrEqual(400);
          }
          for (const f of s.flags) expect(f.token === null || allowed.has(f.token)).toBe(true);
          expect(s.summary.length).toBeLessThanOrEqual(1500);
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
        }
        try {
          const u = parseParentUpdate(r, allowed);
          expect(u.players.every((p) => allowed.has(p.token))).toBe(true);
          expect(u.title.length).toBeLessThanOrEqual(120);
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
        }
        try {
          const p = parseProgress(r);
          expect(p.strengths.length).toBeLessThanOrEqual(5);
          expect(p.strengths.every((s) => s.length > 0 && s.length <= 80)).toBe(true);
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
        }
      }),
      { numRuns: 1000 },
    );
  });
});
