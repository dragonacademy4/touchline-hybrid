import type { PlayerNote, PlayerObservation, SessionFlag } from './types';

export type ChipKind = 'strength' | 'work_on' | 'welfare';

export interface Chip {
  id: string;
  label: string;
  kind: ChipKind;
  /** Plain coach-facing phrase used when no AI is available. */
  phrase: string;
}

export const CHIPS: readonly Chip[] = [
  { id: 'first-touch', label: 'Great first touch', kind: 'strength', phrase: 'a great first touch' },
  { id: 'brave', label: 'Brave', kind: 'strength', phrase: 'bravery on the ball' },
  { id: 'listened', label: 'Listened', kind: 'strength', phrase: 'listening well' },
  { id: 'effort', label: 'Worked hard', kind: 'strength', phrase: 'real effort' },
  { id: 'passing', label: 'Good passing', kind: 'strength', phrase: 'tidy passing' },
  { id: 'teammate', label: 'Helped a teammate', kind: 'strength', phrase: 'helping teammates' },
  { id: 'scanning', label: 'Head up', kind: 'strength', phrase: 'playing with their head up' },
  { id: 'tackle', label: 'Strong tackle', kind: 'strength', phrase: 'strong tackling' },
  { id: 'weak-foot', label: 'Weak foot', kind: 'work_on', phrase: 'using their weaker foot more' },
  { id: 'talk', label: 'Talk more', kind: 'work_on', phrase: 'calling for the ball' },
  { id: 'position', label: 'Hold position', kind: 'work_on', phrase: 'holding their position' },
  { id: 'confidence', label: 'Confidence', kind: 'work_on', phrase: 'taking players on with confidence' },
  { id: 'shooting', label: 'Shooting', kind: 'work_on', phrase: 'shooting technique' },
  { id: 'defending', label: '1v1 defending', kind: 'work_on', phrase: 'staying on their feet when defending 1v1' },
  { id: 'knock', label: 'Took a knock', kind: 'welfare', phrase: 'took a knock' },
  { id: 'upset', label: 'Seemed upset', kind: 'welfare', phrase: 'seemed upset' },
];

const byId = new Map(CHIPS.map((c) => [c.id, c]));
export const chipById = (id: string): Chip | undefined => byId.get(id);

function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Builds a plain observation from chips alone. Used when no model is available
 * (offline and no on-device model) so the coach still gets a usable record.
 */
export function observationFromChips(note: PlayerNote, name: string): PlayerObservation | null {
  const chips = note.chips.map(chipById).filter((c): c is Chip => !!c);
  const strengths = chips.filter((c) => c.kind === 'strength').map((c) => c.phrase);
  const workOns = chips.filter((c) => c.kind === 'work_on').map((c) => c.phrase);
  if (!strengths.length && !workOns.length && !note.text.trim()) return null;
  return {
    playerId: note.playerId,
    strength: strengths.length ? capitalise(joinPhrases(strengths)) + '.' : note.text.trim(),
    nextStep: workOns.length ? `Keep working on ${joinPhrases(workOns)}.` : 'Keep building on this next week.',
    praise: strengths.length ? `Well done ${name}, ${joinPhrases(strengths)} today!` : `Thanks for your effort today, ${name}!`,
  };
}

/** Welfare chips always become flags, whether or not a model runs. */
export function welfareFlags(notes: PlayerNote[], nameOf: (id: string) => string): SessionFlag[] {
  const flags: SessionFlag[] = [];
  for (const n of notes) {
    for (const id of n.chips) {
      const c = chipById(id);
      if (c?.kind === 'welfare') flags.push({ playerId: n.playerId, kind: 'welfare', note: `${nameOf(n.playerId)} ${c.phrase}. Check in with their parent or carer.` });
    }
  }
  return flags;
}
