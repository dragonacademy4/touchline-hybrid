import { LeakError } from '../lib/mask';
import { ParseError } from '../lib/schema';

export type FriendlyErrorKind = 'offline' | 'no_model' | 'cloud_off' | 'leak' | 'parse' | 'quota' | 'app_check' | 'unknown';

export interface FriendlyError {
  kind: FriendlyErrorKind;
  title: string;
  detail: string;
  retry: boolean;
}

/** Turns anything thrown by the AI layer into a message a coach can act on. */
export function friendlyError(e: unknown): FriendlyError {
  if (e instanceof LeakError) {
    return {
      kind: 'leak',
      title: 'Stopped before sending',
      detail: `A name was still in the text (${e.leaks.length}), so nothing was sent. Check the squad nicknames, then try again.`,
      retry: false,
    };
  }
  if (e instanceof ParseError) {
    return { kind: 'parse', title: 'The answer came back muddled', detail: 'The model replied, but not in a shape Touchline can use. Try again.', retry: true };
  }
  const msg = e instanceof Error ? `${e.name} ${e.message} ${(e as { code?: string }).code ?? ''}` : String(e);
  if (/\bcloud_off\b/.test(msg)) {
    return { kind: 'cloud_off', title: 'Cloud AI is switched off', detail: 'Turn on "Use cloud AI when it helps" in Settings to write this. Names stay hidden either way.', retry: false };
  }
  // Firebase AI tags every HTTP error (429, 403, 500...) as "fetch-error" and puts the
  // request URL (".../models/x:generateContent") in the message, so match on the status
  // and specific phrases, not on "fetch-error" or a bare "rate".
  if (/offline|network|failed to fetch|ERR_INTERNET/i.test(msg)) {
    return { kind: 'offline', title: 'No signal', detail: 'Your notes are saved on this phone. Try again when you have signal.', retry: true };
  }
  if (/AbortError|timeout has expired|timed out/i.test(msg)) {
    return { kind: 'quota', title: 'The cloud took too long', detail: 'Your notes are saved. Try again in a moment, or save without AI.', retry: true };
  }
  if (/\b429\b|quota|resource.?exhausted|rate.?limit|too many requests/i.test(msg)) {
    return { kind: 'quota', title: 'The cloud model is busy', detail: 'Too many requests right now. Wait a minute and try again.', retry: true };
  }
  if (/app.?check|attestation|recaptcha|\b403\b|permission/i.test(msg)) {
    return { kind: 'app_check', title: "Couldn't verify this app", detail: 'The cloud model only answers verified copies of Touchline. Reload the page and try again.', retry: true };
  }
  if (/on-device model is not available|LanguageModel API not available|unsupported browser/i.test(msg)) {
    return { kind: 'no_model', title: 'No on-device model here', detail: "Gemini Nano isn't available in this browser, and the cloud isn't an option right now.", retry: false };
  }
  return { kind: 'unknown', title: 'Something went wrong', detail: 'Your notes are safe on this phone. Try again in a moment.', retry: true };
}
