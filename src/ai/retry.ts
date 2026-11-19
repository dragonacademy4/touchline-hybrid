/** Retry with exponential backoff and full jitter, for transient cloud errors. */
export interface RetryOptions {
  retries: number;
  baseMs: number;
  maxMs: number;
  isRetryable: (e: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions): Promise<T> {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= o.retries || !o.isRetryable(e)) throw e;
      const cap = Math.min(o.maxMs, o.baseMs * 2 ** attempt);
      await sleep(Math.round(cap / 2 + random() * (cap / 2)));
    }
  }
}

/** 429, 500, 503 and "high demand" / "overloaded" replies are worth retrying. */
export function isTransient(e: unknown): boolean {
  const s = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ''}` : String(e);
  return isTimeout(e) || /\[(429|500|502|503|504)\b|\b(429|503)\b|high demand|overloaded|unavailable|resource.?exhausted|try again later/i.test(s);
}

/** The request was abandoned after the timeout. Not worth retrying the same model. */
export function isTimeout(e: unknown): boolean {
  const s = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /AbortError|timeout has expired|timed out/i.test(s);
}

/** The model name itself is the problem (retired or unknown): switch models. */
export function isModelMissing(e: unknown): boolean {
  return /not.?found|\b404\b|unsupported model|is not supported/i.test(String(e));
}
