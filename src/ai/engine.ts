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
import { observationFromChips, welfareFlags } from '../lib/chips';
import { addDays, weekStart } from '../lib/dates';
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
 *   prefer_on_device so a device hiccup can still fall back to the cloud
 *   (names are already hidden); otherwise only_on_device.
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

export function buildMasker(players: Player[], settings: Pick<Settings, 'extraHiddenWords'>): Masker {
  return createMasker({
    members: players.map((p) => ({ token: p.token, name: p.name, aliases: p.aliases })),
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
    flags: welfareFlags(session.notes, nameOf),
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
}

/** Builds the masked session prompt. Exposed so the UI can show it before sending. */
export function prepareSessionPrompt(session: Session, players: Player[], settings: Settings, prompts: Prompts = DEFAULT_PROMPTS): MaskedPreview {
  const masker = buildMasker(players, settings);
  const restore: Record<string, string> = {};
  const m = (t: string) => masker.mask(t, restore).text;
  const tokenOf = new Map(players.map((p) => [p.id, p.token]));
  const noted = session.notes.filter(hasNote).filter((n) => tokenOf.has(n.playerId));
  const prompt = buildSessionPrompt(
    {
      date: session.date,
      group: m(session.group),
      focus: m(session.focus),
      generalNotes: m(session.generalNotes),
      players: noted.map((n) => ({ token: tokenOf.get(n.playerId)!, chips: n.chips, text: m(n.text) })),
    },
    prompts.session,
  );
  assertNoLeaks(masker, prompt);
  return { prompt, restore, tokens: new Set(noted.map((n) => tokenOf.get(n.playerId)!)), masker };
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
): Promise<StructuredSession> {
  const plan = planSessionRun(conditions);
  if (plan.kind === 'chips') return chipsOnlySession(session, players);
  const { prompt, restore, tokens, masker } = prepareSessionPrompt(session, players, settings, prompts);
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
    flags: mergeFlags(welfareFlags(session.notes, nameOf), modelFlags),
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
): Promise<CloudReport> {
  if (!canUseCloud(conditions)) throw new Error(conditions.online ? 'cloud_off' : 'offline');
  const week = sessionsInWeek(sessions, group, anyDay);
  if (!week.length) throw new NotEnoughData('No structured sessions for this group this week yet.');
  const masker = buildMasker(players, settings);
  const restore: Record<string, string> = {};
  const m = (t: string) => masker.mask(t, restore).text;
  const tokenOf = new Map(players.map((p) => [p.id, p.token]));
  const records: MaskedSessionRecord[] = week.map((s) => ({
    date: s.date,
    focus: m(s.focus),
    players: s.structured!.observations
      .filter((o) => tokenOf.has(o.playerId))
      .map((o) => ({ token: tokenOf.get(o.playerId)!, strength: m(o.strength), nextStep: m(o.nextStep) })),
  }));
  const tokens = new Set(records.flatMap((r) => r.players.map((p) => p.token)));
  const from = weekStart(anyDay);
  const prompt = buildParentUpdatePrompt(m(group), from, records, prompts.parentUpdate);
  assertNoLeaks(masker, prompt);
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
): Promise<CloudReport> {
  if (!canUseCloud(conditions)) throw new Error(conditions.online ? 'cloud_off' : 'offline');
  const from = addDays(today, -(PROGRESS_DAYS - 1));
  const masker = buildMasker(players, settings);
  const restore: Record<string, string> = {};
  const m = (t: string) => masker.mask(t, restore).text;
  const records = recordsFor(sessions)
    .filter((s) => s.date >= from && s.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((s) => {
      const o = s.structured!.observations.find((x) => x.playerId === player.id);
      return o ? [{ date: s.date, focus: m(s.focus), strength: m(o.strength), nextStep: m(o.nextStep) }] : [];
    });
  if (records.length < 2) throw new NotEnoughData(`${player.name} needs notes from at least 2 sessions in the last 4 weeks.`);
  const prompt = buildProgressPrompt(player.token, from, today, records, prompts.progress);
  assertNoLeaks(masker, prompt);
  const res = await run({ prompt, schema: PROGRESS_SCHEMA, mode: 'only_in_cloud', purpose: 'progress' });
  const parsed = parseProgress(res.text);
  const un = (t: string) => masker.unmask(t, restore);
  return {
    id: `pr-${player.id}-${today}`,
    kind: 'progress',
    subject: player.id,
    period: today,
    title: un(parsed.headline) || `${player.name}: last 4 weeks`,
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
