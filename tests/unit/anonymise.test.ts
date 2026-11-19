import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import rules from '../../firestore.rules?raw';
import { anonymiseSession, type AnonymisedSession } from '../../src/sync/anonymise';
import { buildMasker } from '../../src/ai/engine';
import type { Source } from '../../src/lib/types';
import { containsWord, obs, player, session, settings, structured } from './helpers';

const squad = [player(1, 'Ollie', ['Oliver']), player(2, 'Amara'), player(3, 'Freya'), player(4, 'Sam B', ['Sam']), player(5, 'Sam K', ['Sam']), player(6, 'Ben')];
const masker = buildMasker(squad, settings({ extraHiddenWords: ['Riverside Rovers'] }));
const SECRETS = ['Ollie', 'Oliver', 'Amara', 'Freya', 'Sam', 'Ben', 'Riverside Rovers'];

/** Limits read from firestore.rules, so this test fails if the rules and the code drift apart. */
function ruleLimit(field: string): number {
  const m = new RegExp(`request\\.resource\\.data\\.${field}\\.size\\(\\) (<=|==) (\\d+)`).exec(rules);
  if (!m) throw new Error(`No size rule for ${field}`);
  return Number(m[2]);
}
const allowedKeys = JSON.parse(/hasOnly\(\s*(\[[^\]]*\])\s*\)/.exec(rules)![1].replace(/'/g, '"')) as string[];
const allowedSources = JSON.parse(/source in (\[[^\]]*\])/.exec(rules)![1].replace(/'/g, '"')) as string[];

/** Mirrors the create/update rule in firestore.rules (updatedAt is added by sync.ts). */
function expectSatisfiesRules(r: AnonymisedSession) {
  for (const k of Object.keys(r)) expect(allowedKeys).toContain(k);
  expect(r.v).toBe(1);
  expect(r.date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  expect([...r.group].length).toBeLessThanOrEqual(ruleLimit('group'));
  expect([...r.focus].length).toBeLessThanOrEqual(ruleLimit('focus'));
  expect(typeof r.observations).toBe('string');
  expect(r.observations.length).toBeLessThanOrEqual(ruleLimit('observations'));
  expect(Array.isArray(JSON.parse(r.observations))).toBe(true);
  expect([...r.summary].length).toBeLessThanOrEqual(ruleLimit('summary'));
  expect(allowedSources).toContain(r.source);
}

function expectNoNames(r: AnonymisedSession) {
  const json = JSON.stringify(r);
  for (const w of SECRETS) expect(containsWord(json, w), `"${w}" in ${json}`).toBe(false);
  expect(masker.findLeaks(json)).toEqual([]);
}

describe('firestore.rules', () => {
  it('has the limits this test relies on', () => {
    expect(allowedKeys).toEqual(['v', 'date', 'group', 'focus', 'observations', 'summary', 'source', 'updatedAt']);
    expect(allowedSources).toEqual(['on_device', 'in_cloud', 'manual']);
    expect([ruleLimit('group'), ruleLimit('focus'), ruleLimit('observations'), ruleLimit('summary')]).toEqual([40, 120, 40000, 2000]);
    expect(rules).toContain('request.resource.data.v == 1');
    expect(rules).toContain('request.resource.data.updatedAt == request.time');
  });
});

describe('anonymiseSession', () => {
  const s = session({
    date: '2026-11-18',
    group: "Freya's Five",
    focus: 'Getting Amara and Oliver to scan',
    notes: [],
    structured: structured(
      [
        obs('p1', 'Ollie passed to Freya', 'Talk to Sam more'),
        obs('p2', 'Amara beat Riverside Rovers on her own', 'Rest'),
        obs('deleted', 'Gone player', 'n/a'),
      ],
      { summary: 'Ben and Ollie were great. Sam scored. Contact ollie.smith@example.com.', source: 'on_device' },
    ),
  });

  it('replaces names everywhere with tokens and keeps no restore map', () => {
    const r = anonymiseSession(s, squad, masker)!;
    expectNoNames(r);
    expectSatisfiesRules(r);
    expect(r).toEqual({
      v: 1,
      date: '2026-11-18',
      group: "[P03]'s Five",
      focus: 'Getting [P02] and [P01] to scan',
      observations: JSON.stringify([
        { token: 'P01', strength: '[P01] passed to [P03]', nextStep: 'Talk to [A1] more' },
        { token: 'P02', strength: '[P02] beat [X1] on her own', nextStep: 'Rest' },
      ]),
      summary: '[P06] and [P01] were great. [A1] scored. Contact [X1].',
      source: 'on_device',
    });
    // No praise (addressed to the child by name) and no restore map.
    expect(JSON.stringify(r)).not.toMatch(/praise|restore|example\.com/);
  });

  it('returns null for demo and unstructured sessions', () => {
    expect(anonymiseSession({ ...s, demo: true }, squad, masker)).toBeNull();
    expect(anonymiseSession({ ...s, structured: undefined }, squad, masker)).toBeNull();
  });

  it.each<[Source, AnonymisedSession['source']]>([
    ['on_device', 'on_device'],
    ['in_cloud', 'in_cloud'],
    ['chips', 'manual'],
    ['coach', 'manual'],
    ['demo', 'manual'],
  ])('maps source %s to %s', (from, to) => {
    expect(anonymiseSession({ ...s, structured: { ...s.structured!, source: from } }, squad, masker)!.source).toBe(to);
  });

  it('truncates to the Firestore limits', () => {
    const many = Array.from({ length: 50 }, (_, i) => obs(i % 2 ? 'p1' : 'p2', `Obs ${i}`));
    const big = session({
      group: 'G'.repeat(100),
      focus: 'F'.repeat(500),
      structured: structured(many, { summary: 'S'.repeat(5000) }),
    });
    const r = anonymiseSession(big, squad, masker)!;
    expectSatisfiesRules(r);
    const list = JSON.parse(r.observations);
    expect(list).toHaveLength(40);
    expect(list[39].strength).toBe('Obs 39');
  });

  it('cuts at a word boundary, so a cut word never becomes a name', () => {
    // A plain cut at 2000 would leave "Ben" from "Benchmark" and fail the leak check.
    const summary = 'y'.repeat(1996) + ' Benchmark';
    const r = anonymiseSession({ ...s, group: 'x'.repeat(38) + ' Benchwarmers', structured: { ...s.structured!, summary } }, squad, masker)!;
    expectSatisfiesRules(r);
    expectNoNames(r);
    expect(r.summary).toBe('y'.repeat(1996) + ' ');
    expect(r.group).toBe('x'.repeat(38) + ' ');
    // A cut that already falls between words keeps everything up to the limit.
    const r2 = anonymiseSession({ ...s, focus: 'a'.repeat(119) + ' tail' }, squad, masker)!;
    expect(r2.focus).toBe('a'.repeat(119) + ' ');
  });

  it('never contains a name, whatever the free text (property)', () => {
    const word = fc.constantFrom(...SECRETS, 'Sam B', "Ollie's", 'OLLIE', 'freya', 'Bens', 'Riverside', 'Rovers', 'passed', 'to', 'Benchmark', 'scored', '.', ',', 'and');
    const textArb = fc.array(word, { maxLength: 60 }).map((w) => w.join(' '));
    fc.assert(
      fc.property(textArb, textArb, textArb, textArb, fc.array(fc.tuple(fc.constantFrom('p1', 'p2', 'p3', 'p4', 'p6'), textArb, textArb), { maxLength: 45 }), (group, focus, summary, strength, rows) => {
        const r = anonymiseSession(
          session({ group, focus, structured: structured([obs('p1', strength), ...rows.map(([id, a, b]) => obs(id, a, b))], { summary }) }),
          squad,
          masker,
        )!;
        expectNoNames(r);
        expectSatisfiesRules(r);
      }),
      { numRuns: 300 },
    );
  });
});
