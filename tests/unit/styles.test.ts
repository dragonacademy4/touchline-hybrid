import { describe, expect, it } from 'vitest';

// Preact 11 no longer appends "px" to numbers in inline styles, so `{ maxWidth: 440 }`
// is silently ignored. Dimensions must be strings ('440px'); unitless props stay numbers.
const UNITLESS = new Set(['flex', 'opacity', 'fontWeight', 'zIndex', 'lineHeight', 'order', 'flexGrow', 'flexShrink']);

const sources = import.meta.glob<string>('../../src/ui/**/*.tsx', { query: '?raw', import: 'default', eager: true });

describe('inline styles', () => {
  it('never use bare numbers for dimensions', () => {
    const bad: string[] = [];
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [f, src] of Object.entries(sources)) {
      for (const block of src.match(/style=\{\{[^}]*\}\}/g) ?? []) {
        for (const m of block.matchAll(/\b([a-zA-Z]+): -?\d+(?:\.\d+)?(?=[,} ])/g)) if (!UNITLESS.has(m[1])) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
