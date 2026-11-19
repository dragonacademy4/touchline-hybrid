import { describe, expect, it } from 'vitest';
import { friendlyError, type FriendlyErrorKind } from '../../src/ai/errors';
import { LeakError } from '../../src/lib/mask';
import { ParseError } from '../../src/lib/schema';

const URL = 'https://firebasevertexai.googleapis.com/v1beta/projects/touchline-hybrid/models/gemini-3.8-flash:generateContent';

/** The shape Firebase AI Logic throws: FirebaseError, "AI: ... (AI/code)", plus `code`. */
function aiError(code: string, message: string): Error {
  const e = new Error(`AI: ${message} (AI/${code})`) as Error & { code: string };
  e.name = 'FirebaseError';
  e.code = code;
  return e;
}

describe('friendlyError', () => {
  it('reports a blocked leak with the count and no retry', () => {
    const f = friendlyError(new LeakError(['Ollie', 'Sam']));
    expect(f.kind).toBe('leak');
    expect(f.retry).toBe(false);
    expect(f.detail).toContain('(2)');
    // Never repeats the leaked names back.
    expect(f.detail).not.toMatch(/Ollie|Sam/);
  });

  it('reports a parse failure as retryable', () => {
    expect(friendlyError(new ParseError('bad', 'raw'))).toMatchObject({ kind: 'parse', retry: true });
  });

  it.each<[string, unknown, FriendlyErrorKind, boolean]>([
    ['engine offline', new Error('offline'), 'offline', true],
    ['engine cloud_off', new Error('cloud_off'), 'cloud_off', false],
    ['browser fetch failure', new TypeError('Failed to fetch'), 'offline', true],
    ['firefox network error', new TypeError('NetworkError when attempting to fetch resource.'), 'offline', true],
    ['chrome net error', new Error('net::ERR_INTERNET_DISCONNECTED'), 'offline', true],
    ['firebase wrapped fetch failure', aiError('error', `Error fetching from ${URL}: Failed to fetch`), 'offline', true],
    ['firebase 429', aiError('fetch-error', `Error fetching from ${URL}: [429 Too Many Requests] Resource has been exhausted (e.g. check quota).`), 'quota', true],
    ['firebase 429, no text', aiError('fetch-error', `Error fetching from ${URL}: [429 ] `), 'quota', true],
    ['rate limit text', new Error('Rate limit exceeded'), 'quota', true],
    ['firebase 403 app check', aiError('fetch-error', `Error fetching from ${URL}: [403 Forbidden] Firebase App Check token is invalid.`), 'app_check', true],
    ['firebase 403', aiError('fetch-error', `Error fetching from ${URL}: [403 Forbidden] `), 'app_check', true],
    ['app check sdk', aiError('app-check/fetch-status-error', 'AppCheck: Fetch server returned an HTTP error status'), 'app_check', true],
    ['recaptcha', new Error('reCAPTCHA error'), 'app_check', true],
    ['firebase 500', aiError('fetch-error', `Error fetching from ${URL}: [500 Internal Server Error] Internal error`), 'unknown', true],
    ['firebase 400', aiError('fetch-error', `Error fetching from ${URL}: [400 Bad Request] Invalid JSON payload`), 'unknown', true],
    ['no on-device model', new Error('On-device model is not available.'), 'no_model', false],
    ['no prompt api', new Error('LanguageModel API not available'), 'no_model', false],
    ['generate is not "rate"', new Error('Could not generate content'), 'unknown', true],
    ['plain string', 'quota exceeded', 'quota', true],
    ['undefined', undefined, 'unknown', true],
    ['object', { weird: true }, 'unknown', true],
  ])('%s -> %s', (_label, e, kind, retry) => {
    const f = friendlyError(e);
    expect(f.kind).toBe(kind);
    expect(f.retry).toBe(retry);
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.detail.length).toBeGreaterThan(0);
  });

  it('uses the error code as well as the message', () => {
    const e = new Error('Something odd') as Error & { code: string };
    e.code = 'resource-exhausted';
    expect(friendlyError(e).kind).toBe('quota');
  });
});

describe('timeouts', () => {
  it('maps an abandoned cloud call to a retryable message', async () => {
    const { friendlyError } = await import('../../src/ai/errors');
    const f = friendlyError(Object.assign(new Error('Timeout has expired.'), { name: 'AbortError' }));
    expect(f.title).toBe('The cloud took too long');
    expect(f.retry).toBe(true);
  });
});
