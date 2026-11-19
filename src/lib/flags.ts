import { chipById } from './chips';
import type { Player, Session, SessionFlag } from './types';

export const QUIET_SESSIONS = 3;
const PATTERN_SESSIONS = 3;

function mentioned(s: Session, playerId: string): boolean {
  const n = s.notes.find((x) => x.playerId === playerId);
  const hasNote = !!n && (n.chips.length > 0 || n.text.trim().length > 0);
  const hasObs = !!s.structured?.observations.some((o) => o.playerId === playerId);
  return hasNote || hasObs;
}

/**
 * Flags worked out from history, not by a model, so they are always right:
 * - quiet: a player in the group with no mention in the last 3 sessions they attended
 * - pattern: the same "work on" chip in each of the last 3 sessions for a player
 */
export function historyFlags(players: Player[], sessions: Session[], group: string): SessionFlag[] {
  const groupSessions = sessions
    .filter((s) => s.group === group)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  const flags: SessionFlag[] = [];
  for (const p of players.filter((x) => x.group === group && !x.archived)) {
    const attended = groupSessions.filter((s) => s.attendees.includes(p.id));
    const recent = attended.slice(0, QUIET_SESSIONS);
    if (recent.length >= QUIET_SESSIONS && recent.every((s) => !mentioned(s, p.id))) {
      flags.push({ playerId: p.id, kind: 'quiet', note: `${p.name} hasn't had a mention in ${QUIET_SESSIONS} sessions.` });
    }
    const lastN = attended.slice(0, PATTERN_SESSIONS);
    if (lastN.length === PATTERN_SESSIONS) {
      const sets = lastN.map((s) => new Set(s.notes.find((n) => n.playerId === p.id)?.chips ?? []));
      for (const id of sets[0]) {
        const chip = chipById(id);
        if (chip?.kind === 'work_on' && sets.every((set) => set.has(id))) {
          flags.push({ playerId: p.id, kind: 'pattern', note: `${p.name}: "${chip.label}" noted ${PATTERN_SESSIONS} sessions running. Worth a one-to-one drill?` });
        }
      }
    }
  }
  return flags;
}
