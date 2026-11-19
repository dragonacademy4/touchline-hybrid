/** Small builders shared by the unit tests. */
import { DEFAULT_SETTINGS, type Player, type PlayerNote, type PlayerObservation, type Session, type Settings, type StructuredSession } from '../../src/lib/types';

export function player(n: number, name: string, aliases: string[] = [], extra: Partial<Player> = {}): Player {
  return { id: `p${n}`, token: `P${String(n).padStart(2, '0')}`, name, aliases, group: 'U9 Lions', createdAt: n, ...extra };
}

export function note(playerId: string, chips: string[] = [], text = ''): PlayerNote {
  return { playerId, chips, text };
}

export function obs(playerId: string, strength: string, nextStep = 'Keep going.', praise = 'Well done!'): PlayerObservation {
  return { playerId, strength, nextStep, praise };
}

export function structured(observations: PlayerObservation[], extra: Partial<StructuredSession> = {}): StructuredSession {
  return { observations, summary: '', flags: [], source: 'on_device', sentText: '', model: 'test', createdAt: 0, ...extra };
}

let seq = 0;
export function session(extra: Partial<Session> = {}): Session {
  seq++;
  return {
    id: `s${seq}`,
    date: '2026-11-19',
    group: 'U9 Lions',
    focus: '',
    attendees: [],
    notes: [],
    generalNotes: '',
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}

export function settings(extra: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...extra };
}

/** True when `name` appears as a whole word (any case) in `text`. */
export function containsWord(text: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}
