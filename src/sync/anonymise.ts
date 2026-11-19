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
  observations: Array<{ token: string; strength: string; nextStep: string }>;
  summary: string;
  source: 'on_device' | 'in_cloud' | 'manual';
}

export function anonymiseSession(session: Session, players: Player[], masker: Masker): AnonymisedSession | null {
  if (!session.structured || session.demo) return null;
  const tokenOf = new Map(players.map((p) => [p.id, p.token]));
  // Restore tokens ([A1], [X1]) are not kept: the cloud copy stays one-way.
  const m = (t: string) => masker.mask(t).text;
  const src = session.structured.source;
  const record: AnonymisedSession = {
    v: 1,
    date: session.date,
    group: m(session.group).slice(0, 40),
    focus: m(session.focus).slice(0, 120),
    observations: session.structured.observations
      .filter((o) => tokenOf.has(o.playerId))
      .slice(0, 40)
      .map((o) => ({ token: tokenOf.get(o.playerId)!, strength: m(o.strength), nextStep: m(o.nextStep) })),
    summary: m(session.structured.summary).slice(0, 2000),
    source: src === 'on_device' || src === 'in_cloud' ? src : 'manual',
  };
  assertNoLeaks(masker, JSON.stringify(record));
  return record;
}
