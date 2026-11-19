/**
 * Prompt builders. Everything here takes data that is ALREADY MASKED (player
 * tokens like P03 instead of names). The engine masks first, builds the prompt,
 * then runs a leak check on the final text before any model call.
 *
 * Prompt wording can be overridden from Remote Config (see ai/config.ts); these
 * are the defaults that ship in the app and work offline.
 */
import { chipById } from './chips';

export interface MaskedPlayerNote {
  token: string;
  chips: string[]; // chip ids
  text: string; // masked
}

export interface MaskedSessionInput {
  date: string;
  group: string; // masked
  focus: string; // masked
  generalNotes: string; // masked
  players: MaskedPlayerNote[];
}

export const DEFAULT_SESSION_INSTRUCTIONS = `You help a grassroots youth football coach turn quick pitch-side notes into useful feedback.
Players are referred to by tokens like P03. Never invent names; always use the tokens exactly as given.
Only use what is in the notes. Do not make up events, skills or scores. If a player's notes are thin, keep their lines short and general.
Write in plain UK English. Praise lines speak to the child (age 6 to 12), warm and specific, one sentence, no emojis.
Next steps are one concrete, positive action for next session.
Flags: only real welfare concerns in the notes (injury, upset, missing kit, collected late). Otherwise return an empty list.`;

export const DEFAULT_PARENT_INSTRUCTIONS = `You write a short weekly update from a grassroots youth football coach to the parents of one group.
Players are referred to by tokens like P03. Use the tokens exactly as given; never invent names.
Only use the session records provided. Be warm, specific and honest; no hype, no emojis, plain UK English.
The group message covers what the group worked on and what is coming next. Each player line gives one specific positive and what they are working on.`;

export const DEFAULT_PROGRESS_INSTRUCTIONS = `You write a short development summary for one young footballer (age 6 to 12) for their parents and coach.
The player is referred to by a token like P03; use it exactly as given and never invent a name.
Base everything on the dated session records provided. Show progress over time where the records support it; do not exaggerate.
Plain UK English, warm and practical, no emojis. The home idea must be safe, simple and need only a ball.`;

function chipLabels(ids: string[]): string {
  return ids
    .map((id) => chipById(id))
    .filter((c) => !!c)
    .map((c) => (c!.kind === 'strength' ? `+ ${c!.label}` : c!.kind === 'work_on' ? `work on: ${c!.label}` : `welfare: ${c!.label}`))
    .join('; ');
}

export function buildSessionPrompt(input: MaskedSessionInput, instructions = DEFAULT_SESSION_INSTRUCTIONS): string {
  const lines = [
    instructions,
    '',
    `Session: ${input.date}, group ${input.group || 'unnamed'}, focus: ${input.focus || 'general'}.`,
  ];
  if (input.generalNotes.trim()) lines.push(`Coach's general notes: ${input.generalNotes.trim()}`);
  lines.push('', 'Notes per player:');
  for (const p of input.players) {
    const parts = [chipLabels(p.chips), p.text.trim()].filter(Boolean).join(' | ');
    lines.push(`- ${p.token}: ${parts || '(present, no notes)'}`);
  }
  lines.push('', 'Return JSON with one entry in "players" for every player listed above that has notes, a "summary", and "flags".');
  return lines.join('\n');
}

export interface MaskedSessionRecord {
  date: string;
  focus: string;
  players: Array<{ token: string; strength: string; nextStep: string }>;
}

export function buildParentUpdatePrompt(
  group: string,
  weekOf: string,
  sessions: MaskedSessionRecord[],
  instructions = DEFAULT_PARENT_INSTRUCTIONS,
): string {
  const lines = [instructions, '', `Group: ${group}. Week beginning ${weekOf}.`, ''];
  for (const s of sessions) {
    lines.push(`Session ${s.date} (focus: ${s.focus || 'general'}):`);
    for (const p of s.players) lines.push(`- ${p.token}: did well: ${p.strength} Next: ${p.nextStep}`);
    lines.push('');
  }
  lines.push('Return JSON with "title", "message" and one line per player token in "players".');
  return lines.join('\n');
}

export function buildProgressPrompt(
  token: string,
  from: string,
  to: string,
  records: Array<{ date: string; focus: string; strength: string; nextStep: string }>,
  instructions = DEFAULT_PROGRESS_INSTRUCTIONS,
): string {
  const lines = [instructions, '', `Player: ${token}. Period: ${from} to ${to}. ${records.length} session record(s):`, ''];
  for (const r of records) lines.push(`- ${r.date} (focus: ${r.focus || 'general'}): did well: ${r.strength} Next: ${r.nextStep}`);
  lines.push('', 'Return JSON with "headline", "progress", "strengths", "focus" and "homeIdea".');
  return lines.join('\n');
}
