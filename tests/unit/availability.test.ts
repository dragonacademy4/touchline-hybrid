import { describe, expect, it } from 'vitest';
import { NANO_LABEL, nanoStatus } from '../../src/ai/availability';
import type { NanoStatus } from '../../src/ai/engine';

function scope(answer: string | Error) {
  const calls: unknown[] = [];
  return {
    calls,
    scope: {
      LanguageModel: {
        async availability(options?: object) {
          calls.push(options);
          if (answer instanceof Error) throw answer;
          return answer;
        },
      },
    },
  };
}

describe('nanoStatus', () => {
  it.each<[string, NanoStatus]>([
    ['available', 'available'],
    ['downloadable', 'downloadable'],
    ['downloading', 'downloading'],
    ['unavailable', 'unavailable'],
    ['readily', 'available'],
    ['after-download', 'downloadable'],
    ['no', 'unavailable'],
    ['', 'unavailable'],
  ])('maps %j to %s', async (answer, expected) => {
    expect(await nanoStatus(scope(answer).scope)).toBe(expected);
  });

  it('asks for English text in and out', async () => {
    const s = scope('available');
    await nanoStatus(s.scope);
    expect(s.calls).toEqual([
      { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
    ]);
  });

  it('is unavailable when the API throws', async () => {
    expect(await nanoStatus(scope(new Error('boom')).scope)).toBe('unavailable');
  });

  it('is unsupported without the Prompt API', async () => {
    expect(await nanoStatus({})).toBe('unsupported');
    expect(await nanoStatus({ LanguageModel: {} as never })).toBe('unsupported');
    expect(await nanoStatus({ LanguageModel: { availability: 'yes' } as never })).toBe('unsupported');
    // Node has no LanguageModel global.
    expect(await nanoStatus()).toBe('unsupported');
  });

  it('has a label for every status', () => {
    expect(Object.keys(NANO_LABEL).sort()).toEqual(['available', 'downloadable', 'downloading', 'unavailable', 'unsupported']);
  });
});
