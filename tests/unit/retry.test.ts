import { describe, expect, it } from 'vitest';
import { isModelMissing, isTransient, withRetry } from '../../src/ai/retry';

const opts = (sleeps: number[]) => ({ retries: 2, baseMs: 800, maxMs: 4000, isRetryable: isTransient, sleep: async (ms: number) => void sleeps.push(ms), random: () => 1 });

describe('withRetry', () => {
  it('retries transient errors with exponential backoff, then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const r = await withRetry(async () => { if (n++ < 2) throw new Error('[500 ] This model is currently experiencing high demand.'); return 'ok'; }, opts(sleeps));
    expect(r).toBe('ok');
    expect(sleeps).toEqual([800, 1600]);
  });
  it('gives up after the retry budget', async () => {
    const sleeps: number[] = [];
    await expect(withRetry(async () => { throw new Error('[429 ] Resource exhausted'); }, opts(sleeps))).rejects.toThrow('429');
    expect(sleeps).toHaveLength(2);
  });
  it('does not retry permanent errors', async () => {
    const sleeps: number[] = [];
    await expect(withRetry(async () => { throw new Error('[403 ] App Check token is invalid'); }, opts(sleeps))).rejects.toThrow('403');
    expect(sleeps).toEqual([]);
  });
  it('caps the delay and applies jitter within [cap/2, cap]', async () => {
    const sleeps: number[] = [];
    let n = 0;
    await withRetry(async () => { if (n++ < 5) throw new Error('503'); return 1; }, { ...opts(sleeps), retries: 5, random: () => 0 });
    expect(sleeps).toEqual([400, 800, 1600, 2000, 2000]);
  });
  it('uses real timers by default', async () => {
    let n = 0;
    await expect(withRetry(async () => { if (n++ < 1) throw new Error('503'); return 2; }, { retries: 1, baseMs: 1, maxMs: 2, isRetryable: isTransient })).resolves.toBe(2);
  });
});

describe('classifiers', () => {
  it.each([
    ['AI: Error fetching from https://x/models/gemini-3.8-flash:generateContent: [500 ] This model is currently experiencing high demand.', true],
    ['[503 Service Unavailable] The model is overloaded', true],
    ['[429 ] Resource has been exhausted', true],
    ['[403 ] Firebase App Check token is invalid.', false],
    ['[400 ] Invalid JSON payload', false],
  ])('isTransient(%s) = %s', (m, want) => expect(isTransient(new Error(m))).toBe(want));
  it('isTransient handles non-Error values', () => expect(isTransient('503')).toBe(true));
  it('isModelMissing spots retired models', () => {
    expect(isModelMissing(new Error('[404 ] models/gemini-x is not found for API version v1beta'))).toBe(true);
    expect(isModelMissing(new Error('[500 ] high demand'))).toBe(false);
  });
});

describe('timeouts', () => {
  it('a timeout is transient (switch model) but recognised as a timeout', async () => {
    const { isTimeout } = await import('../../src/ai/retry');
    const e = Object.assign(new Error('Timeout has expired.'), { name: 'AbortError' });
    expect(isTimeout(e)).toBe(true);
    expect(isTransient(e)).toBe(true);
    expect(isTimeout(new Error('[500 ] high demand'))).toBe(false);
    expect(isTimeout('timed out')).toBe(true);
  });
});
