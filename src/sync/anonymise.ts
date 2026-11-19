/**
 * Builds the anonymised record that is synced to Firestore. Player names are
 * replaced by tokens, all free text is masked, and the result is leak-checked.
 * The token-to-name map never leaves the device, so the cloud copy is useless
 * for identifying a child.
 */
import { assertNoLeaks, type Masker } from '../lib/mask';
import type { Player, Session } from '../lib/types';

export interface AnonymisedSession {
  v: 1;
  date: string;
  group: string;
  focus: string;
  /** JSON array of { token, strength, nextStep }, stored as one string so the rules can bound its size. */
  observations: string;
  summary: string;
  source: 'on_device' | 'in_cloud' | 'manual';
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

/**
 * Cuts to `max` characters without leaving part of a word: cutting "Benchmark"
 * to "Ben" would otherwise turn an ordinary word into a squad name and fail the
 * leak check, blocking sync for that session.
 */
function clip(t: string, max: number): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return WORD_CHAR.test(t[max]) ? cut.replace(/[\p{L}\p{M}\p{N}]+$/u, '') : cut;
}

export interface AnonymisedObservation {
  token: string;
  strength: string;
  nextStep: string;
}

/** Max length of the observations JSON string (matches firestore.rules). */
export const MAX_OBSERVATIONS_JSON = 40_000;

export function anonymiseSession(session: Session, players: Player[], masker: Masker): AnonymisedSession | null {
  if (!session.structured || session.demo) return null;
  const tokenOf = new Map(players.map((p) => [p.id, p.token]));
  // Restore tokens ([A1], [X1]) are not kept: the cloud copy stays one-way.
  const m = (t: string) => masker.mask(t).text;
  const src = session.structured.source;
  const record: AnonymisedSession = {
    v: 1,
    date: session.date,
    group: clip(m(session.group), 40),
    focus: clip(m(session.focus), 120),
    observations: observationsJson(
      session.structured.observations
        .filter((o) => tokenOf.has(o.playerId))
        .slice(0, 40)
        .map((o) => ({ token: tokenOf.get(o.playerId)!, strength: clip(m(o.strength), 400), nextStep: clip(m(o.nextStep), 400) })),
    ),
    summary: clip(m(session.structured.summary), 2000),
    source: src === 'on_device' || src === 'in_cloud' ? src : 'manual',
  };
  assertNoLeaks(masker, JSON.stringify(record));
  return record;
}

/** Serialises observations, dropping trailing entries if needed to stay within the rules' size limit. */
function observationsJson(list: AnonymisedObservation[]): string {
  let out = JSON.stringify(list);
  while (out.length > MAX_OBSERVATIONS_JSON && list.length) {
    list = list.slice(0, -1);
    out = JSON.stringify(list);
  }
  return out;
}
