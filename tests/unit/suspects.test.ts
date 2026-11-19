import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { findSuspectNames } from '../../src/lib/suspects';

describe('findSuspectNames', () => {
  it.each([
    ['Told Mason well done too', ['Mason']],
    ['mum Sarah Jones picked him up', ['Sarah Jones']],
    ['Mason was great today', ['Mason']],
    ['Great job today. Brilliant pass.', []],
    ['[P01] passed to Kayden, then [P02] scored', ['Kayden']],
    ['Spoke to Mrs Patel after', ['Patel']],
    ['said his dad moved out. keep an eye.', []],
    ['Monday training, April fixtures, U9 rondo', []],
    ['GREAT game from everyone', []],
    ["Ffion's pass was lovely", ['Ffion']],
    ['Played against Riverside Rovers on Saturday', ['Riverside Rovers']],
    ['I think [P03] was tired', []],
    ['', []],
  ])('%j -> %j', (text, want) => {
    expect(findSuspectNames(text)).toEqual(want);
  });
  it('ignores words the caller says are app text (chip labels)', () => {
    expect(findSuspectNames('+ Brave; work on: Weak foot | went in Head up', ['Head', 'Weak', 'Brave'])).toEqual([]);
  });
  it('a family word catches even a common word used as a name', () => {
    expect(findSuspectNames('collected by grandad Bob')).toEqual(['Bob']);
  });
  it('dedupes and keeps first-seen order across lines', () => {
    expect(findSuspectNames('saw Mason\nMason again, and Leo')).toEqual(['Mason', 'Leo']);
  });
  it('never throws on arbitrary text', () => {
    fc.assert(fc.property(fc.string({ unit: 'grapheme', maxLength: 300 }), (t) => {
      expect(Array.isArray(findSuspectNames(t))).toBe(true);
    }), { numRuns: 1000 });
  });
});
