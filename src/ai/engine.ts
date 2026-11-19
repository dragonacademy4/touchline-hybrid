/**
 * The hybrid AI pipeline. Every call follows the same steps:
 *   1. mask names on the device (lib/mask.ts)
 *   2. build the prompt from masked data (lib/prompts.ts)
 *   3. leak check: refuse to call if any name survived
 *   4. run the model: on-device first for session notes, cloud-only for the
 *      richer reports (see `planSessionRun` for the exact rules)
 *   5. parse the structured output (lib/schema.ts) and restore names locally
 *
 * The model call itself is injected (`ModelRunner`) so this file has no
 * Firebase dependency and is fully unit-tested. ai/firebase.ts provides the
 * real runner using Firebase AI Logic.
 */
import { assertNoLeaks, createMasker, type Masker } from '../lib/mask';
import { CHIPS, observationFromChips, textWelfareFlags, welfareFlags } from '../lib/chips';

/** Chip labels are app text, not names ("Head up", "Great first touch"). */
const CHIP_WORDS = CHIPS.flatMap((c) => c.label.split(/\s+/));
import { addDays, shortDate, weekStart } from '../lib/dates';
import { findSuspectNames } from '../lib/suspects';
import {
  buildParentUpdatePrompt,
  buildProgressPrompt,
  buildSessionPrompt,
  DEFAULT_PARENT_INSTRUCTIONS,
  DEFAULT_PROGRESS_INSTRUCTIONS,
  DEFAULT_SESSION_INSTRUCTIONS,
  type MaskedSessionRecord,
} from '../lib/prompts';
import { PARENT_UPDATE_SCHEMA, parseParentUpdate, parseProgress, parseSession, PROGRESS_SCHEMA, SESSION_SCHEMA } from '../lib/schema';
import type { CloudReport, Player, PlayerObservation, Session, SessionFlag, Settings, StructuredSession } from '../lib/types';

export type Mode = 'prefer_on_device' | 'only_on_device' | 'only_in_cloud';
export type Purpose = 'session' | 'parent_update' | 'progress';

export interface RunRequest {
  prompt: string;
  schema: object;
  mode: Mode;
  purpose: Purpose;
}

export interface RunResult {
  text: string;
  source: 'on_device' | 'in_cloud';
  model: string;
}

export type ModelRunner = (req: RunRequest) => Promise<RunResult>;

/** Gemini Nano availability as reported by Chrome's LanguageModel.availability(). */
export type NanoStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export interface Conditions {
  online: boolean;
  nano: NanoStatus;
  cloudAllowed: boolean;
}

export interface Prompts {
  session: string;
  parentUpdate: string;
  progress: string;
}

export const DEFAULT_PROMPTS: Prompts = {
  session: DEFAULT_SESSION_INSTRUCTIONS,
  parentUpdate: DEFAULT_PARENT_INSTRUCTIONS,
  progress: DEFAULT_PROGRESS_INSTRUCTIONS,
};

export type SessionPlan =
  | { kind: 'model'; mode: Mode; expect: 'on_device' | 'in_cloud' }
  | { kind: 'chips'; reason: 'offline_no_nano' | 'cloud_off_no_nano' };

/**
 * Where session structuring runs:
 * - Gemini Nano ready: on-device. If cloud is allowed and we're online, use
 *   prefer_on_device, so the SDK uses the cloud if Nano stops being available
 *   between our check and the call (names are already hidden); otherwise
 *   only_on_device.
 * - No Nano, online, cloud allowed: the cloud (names hidden).
 * - No Nano and offline (or cloud switched off): no model. Build plain notes
 *   from the chips and keep the session ready to structure later.
 */
export function planSessionRun(c: Conditions): SessionPlan {
  const nanoReady = c.nano === 'available';
  const cloudOk = c.online && c.cloudAllowed;
  if (nanoReady) return { kind: 'model', mode: cloudOk ? 'prefer_on_device' : 'only_on_device', expect: 'on_device' };
  if (cloudOk) return { kind: 'model', mode: 'prefer_on_device', expect: 'in_cloud' };
  return { kind: 'chips', reason: c.online ? 'cloud_off_no_nano' : 'offline_no_nano' };
}

export function canUseCloud(c: Conditions): boolean {
  return c.online && c.cloudAllowed;
}

/**
 * Leak-checks the data part of a prompt. The fixed instructions come first and
 * are app text (or Remote Config), not notes about a child, so they are skipped:
 * otherwise a child called "An" would block "return an empty list".
 */
function assertDataHasNoLeaks(masker: Masker, prompt: string, instructions: string) {
  assertNoLeaks(masker, prompt.startsWith(instructions) ? prompt.slice(instructions.length) : prompt);
}

export function buildMasker(players: Player[], settings: Pick<Settings, 'extraHiddenWords'>): Masker {
  return createMasker({
    members: players.filter((p) => !p.erased).map((p) => ({ token: p.token, name: p.name, aliases: p.aliases })),
    extraTerms: settings.extraHiddenWords,
  });
}

function hasNote(n: { chips: string[]; text: string }) {
  return n.chips.length > 0 || n.text.trim().length > 0;
}

/** Plain notes from chips, no model. */
export function chipsOnlySession(session: Session, players: Player[]): StructuredSession {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Player';
  const observations = session.notes
    .filter(hasNote)
    .map((n) => observationFromChips(n, nameOf(n.playerId)))
    .filter((o): o is PlayerObservation => !!o);
  return {
    observations,
    summary: session.generalNotes.trim(),
    flags: withTextFlags(welfareFlags(session.notes, nameOf), session.notes, nameOf),
    source: 'chips',
    sentText: '',
    model: 'none',
    createdAt: Date.now(),
  };
}

export interface MaskedPreview {
  prompt: string;
  restore: Record<string, string>;
  tokens: Set<string>;
  masker: Masker;
  /** The coach-written parts of the prompt, masked, one per line (for the pre-send check). */
  userText: string;
}

/**
 * Called before anything that may reach the cloud is sent, when the masked text
 * still contains words that look like names of people outside the squad.
 * Resolve with the words to hide (an empty list sends as is), or null to cancel.
 */
export type ConfirmSend = (check: { prompt: string; suspects: string[] }) => Promise<string[] | null>;

export class SendCancelled extends Error {
  constructor() {
    super('Cancelled by the coach before sending.');
    this.name = 'SendCancelled';
  }
}

/** Builds once, asks the coach about suspect names, and rebuilds with the chosen words hidden. */
async function checkBeforeSend<T extends { prompt: string; userText: string }>(build: (extraHide: string[]) => T, confirm?: ConfirmSend): Promise<T> {
  const first = build([]);
  if (!confirm) return first;
  const suspects = findSuspectNames(first.userText, CHIP_WORDS);
  if (!suspects.length) return first;
  const hide = await confirm({ prompt: first.prompt, suspects });
  if (hide === null) throw new SendCancelled();
  return hide.length ? build(hide) : first;
}

/** Builds the masked session prompt. Exposed so the UI can show it before sending. */
export function prepareSessionPrompt(
  session: Session,
  players: Player[],
  settings: Settings,
  prompts: Prompts = DEFAULT_PROMPTS,
  extraHide: string[] = [],
): MaskedPreview {
  const masker = buildMasker(players, { extraHiddenWords: [...settings.extraHiddenWords, ...extraHide] });
  const restore: Record<string, string> = {};
  const m = (t: string) => masker.mask(t, restore).text;
  const tokenOf = new Map(players.map((p) => [p.id, p.token]));
  const noted = session.notes.filter(hasNote).filter((n) => tokenOf.has(n.playerId));
  const input = {
    date: session.date,
    group: m(session.group),
    focus: m(session.focus),
    generalNotes: m(session.generalNotes),
    players: noted.map((n) => ({ token: tokenOf.get(n.playerId)!, chips: n.chips, text: m(n.text) })),
  };
  const prompt = buildSessionPrompt(input, prompts.session);
  assertDataHasNoLeaks(masker, prompt, prompts.session);
  const userText = [input.focus, input.generalNotes, ...input.players.map((p) => p.text)].filter(Boolean).join('\n');
  return { prompt, restore, tokens: new Set(noted.map((n) => tokenOf.get(n.playerId)!)), masker, userText };
}

/** Adds free-text welfare flags for children who aren't flagged already. */
function withTextFlags(flags: SessionFlag[], notes: Session['notes'], nameOf: (id: string) => string): SessionFlag[] {
  const flagged = new Set(flags.filter((f) => f.kind === 'welfare').map((f) => f.playerId));
  return [...flags, ...textWelfareFlags(notes, nameOf).filter((f) => !flagged.has(f.playerId))];
}

/**
 * Chip flags are always kept (a coach-tapped welfare chip must never vanish).
 * A model flag is dropped when it restates a player already flagged by a chip,
 * or repeats a note already present for the same player.
 */
function mergeFlags(chipFlags: SessionFlag[], modelFlags: SessionFlag[]): SessionFlag[] {
  const chipPlayers = new Set(chipFlags.map((f) => f.playerId));
  const seen = new Set<string>();
  return [
    ...chipFlags,
    ...modelFlags.filter((f) => {
      if (f.playerId !== null && chipPlayers.has(f.playerId)) return false;
      const key = `${f.playerId}|${f.note.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

export async function structureSession(
  session: Session,
  players: Player[],
  settings: Settings,
  conditions: Conditions,
  run: ModelRunner,
  prompts: Prompts = DEFAULT_PROMPTS,
  confirm?: ConfirmSend,
): Promise<StructuredSession> {
  const plan = planSessionRun(conditions);
  if (plan.kind === 'chips') return chipsOnlySession(session, players);
  // Only ask when the call may reach the cloud; only_on_device never leaves the phone.
  const { prompt, restore, tokens, masker } = await checkBeforeSend(
    (extra) => prepareSessionPrompt(session, players, settings, prompts, extra),
    plan.mode === 'only_on_device' ? undefined : confirm,
  );
  if (tokens.size === 0 && !session.generalNotes.trim()) return chipsOnlySession(session, players);
  const res = await run({ prompt, schema: SESSION_SCHEMA, mode: plan.mode, purpose: 'session' });
  const parsed = parseSession(res.text, tokens);
  const byToken = new Map(players.map((p) => [p.token, p]));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Player';
  const un = (t: string) => masker.unmask(t, restore);

  const observations: PlayerObservation[] = parsed.players.map((p) => ({
    playerId: byToken.get(p.token)!.id,
    strength: un(p.strength),
    nextStep: un(p.nextStep),
    praise: un(p.praise),
  }));
  // Anyone with notes the model skipped still gets a plain record from their chips.
  for (const n of session.notes.filter(hasNote)) {
    if (observations.some((o) => o.playerId === n.playerId)) continue;
    const o = observationFromChips(n, nameOf(n.playerId));
    if (o) observations.push(o);
  }
  const modelFlags: SessionFlag[] = parsed.flags.map((f) => ({
    playerId: f.token ? byToken.get(f.token)!.id : null,
    kind: 'welfare',
    note: un(f.note),
  }));
  return {
    observations,
    summary: un(parsed.summary),
    flags: withTextFlags(mergeFlags(welfareFlags(session.notes, nameOf), modelFlags), session.notes, nameOf),
    source: res.source,
    sentText: prompt,
    model: res.model,
    createdAt: Date.now(),
  };
}

function recordsFor(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.structured && s.structured.observations.length > 0);
}

export class NotEnoughData extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotEnoughData';
  }
}

/** Sessions for `group` in the week (Mon-Sun) containing `anyDay`. */
export function sessionsInWeek(sessions: Session[], group: string, anyDay: string): Session[] {
  const from = weekStart(anyDay);
  const to = addDays(from, 6);
  return recordsFor(sessions)
    .filter((s) => s.group === group && s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Weekly parent update for a group. Always runs in the cloud, with names hidden. */
export async function parentUpdate(
  group: string,
  anyDay: string,
  sessions: Session[],
  players: Player[],
  settings: Settings,
  conditions: Conditions,
  run: ModelRunner,
  prompts: Prompts = DEFAULT_PROMPTS,
  confirm?: ConfirmSend,
): Promise<CloudReport> {
  if (!canUseCloud(conditions)) throw new Error(conditions.online ? 'cloud_off' : 'offline');
  const week = sessionsInWeek(sessions, group, anyDay);
  if (!week.length) throw new NotEnoughData('No structured sessions for this group this week yet.');
  const from = weekStart(anyDay);
  const tokenOf = new Map(players.map((p) => [p.id, p.token]));
  const { prompt, masker, restore, tokens } = await checkBeforeSend((extra) => {
    const masker = buildMasker(players, { extraHiddenWords: [...settings.extraHiddenWords, ...extra] });
    const restore: Record<string, string> = {};
    const m = (t: string) => masker.mask(t, restore).text;
    const records: MaskedSessionRecord[] = week.map((s) => ({
      date: shortDate(s.date, anyDay),
      focus: m(s.focus),
      players: s.structured!.observations
        .filter((o) => tokenOf.has(o.playerId))
        .map((o) => ({ token: tokenOf.get(o.playerId)!, strength: m(o.strength), nextStep: m(o.nextStep) })),
    }));
    const prompt = buildParentUpdatePrompt(m(group), shortDate(from, anyDay), records, prompts.parentUpdate);
    assertDataHasNoLeaks(masker, prompt, prompts.parentUpdate);
    const userText = records.flatMap((r) => [r.focus, ...r.players.flatMap((p) => [p.strength, p.nextStep])]).join('\n');
    return { prompt, masker, restore, tokens: new Set(records.flatMap((r) => r.players.map((p) => p.token))), userText };
  }, confirm);
  const res = await run({ prompt, schema: PARENT_UPDATE_SCHEMA, mode: 'only_in_cloud', purpose: 'parent_update' });
  const parsed = parseParentUpdate(res.text, tokens);
  const byToken = new Map(players.map((p) => [p.token, p]));
  const un = (t: string) => masker.unmask(t, restore);
  return {
    id: `pu-${group}-${from}`,
    kind: 'parent_update',
    subject: group,
    period: from,
    title: un(parsed.title),
    body: un(parsed.message),
    items: parsed.players.map((p) => ({ playerId: byToken.get(p.token)!.id, text: un(p.line) })),
    source: res.source,
    sentText: prompt,
    receivedText: res.text,
    model: res.model,
    createdAt: Date.now(),
  };
}

/**
 * The weekly update without any model: the week's focus and each child's
 * latest "did well" line, exactly as already reviewed by the coach. Used when
 * the cloud can't be reached.
 */
export function localParentUpdate(group: string, anyDay: string, sessions: Session[], players: Player[]): CloudReport {
  const week = sessionsInWeek(sessions, group, anyDay);
  if (!week.length) throw new NotEnoughData('No structured sessions for this group this week yet.');
  const from = weekStart(anyDay);
  const focuses = [...new Set(week.map((s) => s.focus.trim()).filter(Boolean))];
  const known = new Set(players.filter((p) => !p.erased).map((p) => p.id));
  const latest = new Map<string, string>();
  for (const s of week) for (const o of s.structured!.observations) if (known.has(o.playerId)) latest.set(o.playerId, o.strength);
  const list = focuses.map((f) => f[0].toLowerCase() + f.slice(1));
  const topics = list.length <= 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return {
    id: `pu-${group}-${from}`,
    kind: 'parent_update',
    subject: group,
    period: from,
    title: 'This week at training',
    body: topics ? `This week the group worked on ${topics}. Here's something each player did well.` : "Here's something each player did well this week.",
    items: [...latest].map(([playerId, text]) => ({ playerId, text })),
    source: 'notes',
    sentText: '',
    receivedText: '',
    model: 'none',
    createdAt: Date.now(),
  };
}

export const PROGRESS_DAYS = 28;

/** 4-week progress for one player. Always runs in the cloud, with names hidden. */
export async function progressReport(
  player: Player,
  today: string,
  sessions: Session[],
  players: Player[],
  settings: Settings,
  conditions: Conditions,
  run: ModelRunner,
  prompts: Prompts = DEFAULT_PROMPTS,
  confirm?: ConfirmSend,
): Promise<CloudReport> {
  if (!canUseCloud(conditions)) throw new Error(conditions.online ? 'cloud_off' : 'offline');
  const from = addDays(today, -(PROGRESS_DAYS - 1));
  const mine = recordsFor(sessions)
    .filter((s) => s.date >= from && s.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) => {
      const o = s.structured!.observations.find((x) => x.playerId === player.id);
      return o ? [{ s, o }] : [];
    });
  if (mine.length < 2) throw new NotEnoughData(`${player.name} needs notes from at least 2 sessions in the last 4 weeks.`);
  const { prompt, masker, restore } = await checkBeforeSend((extra) => {
    const masker = buildMasker(players, { extraHiddenWords: [...settings.extraHiddenWords, ...extra] });
    const restore: Record<string, string> = {};
    const m = (t: string) => masker.mask(t, restore).text;
    // Readable dates ("Mon 3 Nov") so the report doesn't quote ISO dates back.
    const records = mine.map(({ s, o }) => ({ date: shortDate(s.date, today), focus: m(s.focus), strength: m(o.strength), nextStep: m(o.nextStep) }));
    const prompt = buildProgressPrompt(player.token, shortDate(from, today), shortDate(today, today), records, prompts.progress);
    assertDataHasNoLeaks(masker, prompt, prompts.progress);
    return { prompt, masker, restore, userText: records.flatMap((r) => [r.focus, r.strength, r.nextStep]).join('\n') };
  }, confirm);
  const res = await run({ prompt, schema: PROGRESS_SCHEMA, mode: 'only_in_cloud', purpose: 'progress' });
  const parsed = parseProgress(res.text);
  const un = (t: string) => masker.unmask(t, restore);
  return {
    id: `pr-${player.id}-${today}`,
    kind: 'progress',
    subject: player.id,
    period: today,
    title: un(parsed.headline) || `${player.name}: progress across ${mine.length} sessions`,
    body: un(parsed.progress),
    items: [
      ...parsed.strengths.map((s) => ({ playerId: null, text: `Strength: ${un(s)}` })),
      ...(parsed.focus ? [{ playerId: null, text: `Next focus: ${un(parsed.focus)}` }] : []),
      ...(parsed.homeIdea ? [{ playerId: null, text: `Try at home: ${un(parsed.homeIdea)}` }] : []),
    ],
    source: res.source,
    sentText: prompt,
    receivedText: res.text,
    model: res.model,
    createdAt: Date.now(),
  };
}
