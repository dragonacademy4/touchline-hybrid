/**
 * App state (Preact signals) and the actions screens call. IndexedDB is the
 * source of truth; signals mirror it for rendering.
 */
import { computed, signal } from '@preact/signals';
import * as store from './db';
import { demoPlayers, demoSessions } from './demo';
import { addDays, londonDate } from '../lib/dates';
import { historyFlags } from '../lib/flags';
import { DEFAULT_SETTINGS, type CloudReport, type Player, type Session, type Settings, type StructuredSession } from '../lib/types';
import type { Conditions, ModelRunner, NanoStatus } from '../ai/engine';

export const players = signal<Player[]>([]);
export const sessions = signal<Session[]>([]);
export const reports = signal<CloudReport[]>([]);
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
export const loaded = signal(false);
export const loadError = signal<string | null>(null);
export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
export const nano = signal<NanoStatus>('unsupported');
export const nanoProgress = signal<number | null>(null);

export const activePlayers = computed(() => players.value.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)));
export const groups = computed(() => {
  const set = new Set(activePlayers.value.map((p) => p.group).filter(Boolean));
  for (const s of sessions.value) if (s.group) set.add(s.group);
  return [...set].sort();
});
export const sortedSessions = computed(() =>
  [...sessions.value].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date))),
);
export const conditions = computed<Conditions>(() => ({ online: online.value, nano: nano.value, cloudAllowed: settings.value.cloudAllowed }));

/** Players in `group` who got feedback (a note or observation) in the last 7 days. */
export function weeklyCoverage(group: string | null, today = londonDate()) {
  const from = addDays(today, -6);
  const squad = activePlayers.value.filter((p) => !group || p.group === group);
  const recent = sessions.value.filter((s) => s.date >= from && s.date <= today && (!group || s.group === group));
  const noted = new Set<string>();
  for (const s of recent) {
    for (const n of s.notes) if (n.chips.length || n.text.trim()) noted.add(n.playerId);
    for (const o of s.structured?.observations ?? []) noted.add(o.playerId);
  }
  const covered = squad.filter((p) => noted.has(p.id));
  return { total: squad.length, covered: covered.length, missing: squad.filter((p) => !noted.has(p.id)), sessions: recent.length };
}

export function flagsFor(group: string) {
  return historyFlags(players.value, sessions.value, group);
}

// ---------- Toasts and haptics ----------

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
export const toasts = signal<Toast[]>([]);
let toastId = 0;
export function toast(text: string, action?: Toast['action'], ms = 4000) {
  const id = ++toastId;
  toasts.value = [...toasts.value, { id, text, action }];
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms);
}

/** A short tick for a discrete change (Android Chrome). Off when reduced motion is on. */
export function tick() {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    navigator.vibrate(8);
  } catch {
    /* not allowed before a gesture */
  }
}

// ---------- Load ----------

export async function init() {
  try {
    const all = await store.loadAll();
    players.value = all.players;
    sessions.value = all.sessions;
    reports.value = all.reports;
    settings.value = all.settings;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

export async function updateSettings(patch: Partial<Settings>) {
  const next = { ...settings.value, ...patch };
  settings.value = next;
  await store.putSettings(next);
}

export async function loadDemo() {
  const ps = demoPlayers();
  const ss = demoSessions(ps);
  await store.putMany(ps, ss);
  players.value = [...players.value.filter((p) => !p.id.startsWith('demo-')), ...ps];
  sessions.value = [...sessions.value.filter((s) => !s.id.startsWith('demo-')), ...ss];
  await updateSettings({ onboarded: true, nextToken: Math.max(settings.value.nextToken, ps.length + 1) });
}

// ---------- Players ----------

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cleanAliases(raw: string): string[] {
  return [...new Set(raw.split(',').map((a) => a.trim()).filter((a) => a.length >= 2))];
}

export async function savePlayer(input: { id?: string; name: string; aliases: string[]; group: string }): Promise<Player> {
  const existing = input.id ? players.value.find((p) => p.id === input.id) : undefined;
  let player: Player;
  if (existing) {
    player = { ...existing, name: input.name.trim(), aliases: input.aliases, group: input.group.trim() };
  } else {
    const n = settings.value.nextToken;
    player = {
      id: uid('p'),
      token: `P${String(n).padStart(2, '0')}`,
      name: input.name.trim(),
      aliases: input.aliases,
      group: input.group.trim(),
      createdAt: Date.now(),
    };
    await updateSettings({ nextToken: n + 1 });
  }
  await store.putPlayer(player);
  players.value = [...players.value.filter((p) => p.id !== player.id), player];
  return player;
}

/** Players with history are archived (their token is never reused); others are deleted. */
export async function removePlayer(id: string): Promise<'archived' | 'deleted'> {
  const p = players.value.find((x) => x.id === id);
  if (!p) return 'deleted';
  const used = sessions.value.some((s) => s.attendees.includes(id) || s.notes.some((n) => n.playerId === id));
  if (used) {
    const archived = { ...p, archived: true };
    await store.putPlayer(archived);
    players.value = players.value.map((x) => (x.id === id ? archived : x));
    return 'archived';
  }
  await store.deletePlayer(id);
  players.value = players.value.filter((x) => x.id !== id);
  return 'deleted';
}

/**
 * Removes a child and erases everything about them: notes, feedback and flags
 * in every session, reports about them, and their lines in parent updates.
 * Backed-up sessions are re-sent without them. The token is not reused.
 */
export async function erasePlayer(id: string) {
  const p = players.value.find((x) => x.id === id);
  if (!p) return;
  for (const s of sessions.value) {
    const involved = s.attendees.includes(id) || s.notes.some((n) => n.playerId === id) || s.structured?.observations.some((o) => o.playerId === id) || s.structured?.flags.some((f) => f.playerId === id);
    if (!involved) continue;
    await saveSession({
      ...s,
      attendees: s.attendees.filter((x) => x !== id),
      notes: s.notes.filter((n) => n.playerId !== id),
      structured: s.structured && {
        ...s.structured,
        observations: s.structured.observations.filter((o) => o.playerId !== id),
        flags: s.structured.flags.filter((f) => f.playerId !== id),
      },
    });
  }
  for (const r of reports.value) {
    if (r.subject === id) await removeReport(r.id);
    else if (r.items.some((i) => i.playerId === id)) await saveReport({ ...r, items: r.items.filter((i) => i.playerId !== id) });
  }
  await store.putPlayer({ ...p, name: 'Removed player', aliases: [], archived: true, erased: true });
  players.value = players.value.map((x) => (x.id === id ? { ...p, name: 'Removed player', aliases: [], archived: true, erased: true } : x));
}

export async function restorePlayer(p: Player) {
  const restored = { ...p, archived: false };
  await store.putPlayer(restored);
  players.value = [...players.value.filter((x) => x.id !== p.id), restored];
}

// ---------- Sessions ----------

export async function createSession(group: string, focus = ''): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: uid('s'),
    date: londonDate(),
    group,
    focus,
    attendees: activePlayers.value.filter((p) => p.group === group).map((p) => p.id),
    notes: [],
    generalNotes: '',
    createdAt: now,
    updatedAt: now,
  };
  await store.putSession(session);
  sessions.value = [...sessions.value, session];
  return session;
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
/** Sync soon after a change to a structured session (edits included), batched. */
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), 1500);
}

export async function saveSession(s: Session) {
  const next = { ...s, updatedAt: Date.now() };
  sessions.value = sessions.value.map((x) => (x.id === s.id ? next : x));
  await store.putSession(next);
  if (next.structured && !next.demo) scheduleSync();
  return next;
}

export async function removeSession(id: string) {
  const s = sessions.value.find((x) => x.id === id);
  await store.deleteSession(id);
  sessions.value = sessions.value.filter((x) => x.id !== id);
  if (s?.syncedAt) {
    const { deleteCloudCopy } = await import('../sync/sync');
    void deleteCloudCopy(id);
  }
}

export async function restoreSession(s: Session) {
  // The cloud copy was deleted with the session, so send it again.
  const restored = { ...s, syncedAt: undefined };
  await store.putSession(restored);
  sessions.value = [...sessions.value.filter((x) => x.id !== s.id), restored];
  if (restored.structured && !restored.demo) scheduleSync();
}

export async function setStructured(id: string, structured: StructuredSession) {
  const s = sessions.value.find((x) => x.id === id);
  if (!s) return;
  return saveSession({ ...s, structured });
}

// ---------- Reports ----------

export async function saveReport(r: CloudReport) {
  await store.putReport(r);
  reports.value = [...reports.value.filter((x) => x.id !== r.id), r];
}

export async function removeReport(id: string) {
  await store.deleteReport(id);
  reports.value = reports.value.filter((x) => x.id !== id);
}

// ---------- Sync ----------

export async function syncNow() {
  // Backup is a cloud feature too: it stops when the coach switches cloud off.
  if (!online.value || !settings.value.syncEnabled || !settings.value.cloudAllowed) return;
  const { syncSessions } = await import('../sync/sync');
  const res = await syncSessions(sessions.value, players.value, settings.value, async (sessionId, sentUpdatedAt) => {
    const s = sessions.value.find((x) => x.id === sessionId);
    // Edited while the write was in flight: leave it pending so the newer version is sent.
    if (!s || s.updatedAt !== sentUpdatedAt) return;
    const next = { ...s, syncedAt: Date.now() };
    sessions.value = sessions.value.map((x) => (x.id === sessionId ? next : x));
    await store.putSession(next);
  });
  if (!res.ok) console.warn('Sync not available yet:', res.error);
}

// ---------- Data controls ----------

/** Removes the fictional demo squad, its sessions and reports about them. Your own data stays. */
export async function removeDemo() {
  const demoPlayers = new Set(players.value.filter((p) => p.id.startsWith('demo-')).map((p) => p.id));
  const doomedReports = reports.value.filter(
    (r) => demoPlayers.has(r.subject) || (r.kind === 'parent_update' && r.items.length > 0 && r.items.every((i) => i.playerId && demoPlayers.has(i.playerId))),
  );
  for (const id of demoPlayers) await store.deletePlayer(id);
  for (const s of sessions.value.filter((x) => x.demo)) await store.deleteSession(s.id);
  for (const r of doomedReports) await store.deleteReport(r.id);
  players.value = players.value.filter((p) => !demoPlayers.has(p.id));
  sessions.value = sessions.value.filter((x) => !x.demo);
  reports.value = reports.value.filter((r) => !doomedReports.includes(r));
}

export const hasDemo = computed(() => players.value.some((p) => p.id.startsWith('demo-')) || sessions.value.some((s) => s.demo));

/** Restores a file made by Export, replacing what's on this phone. Throws a readable Error if the file isn't one. */
export async function importJson(text: string): Promise<{ players: number; sessions: number }> {
  let data: { app?: string; players?: Player[]; sessions?: Session[]; reports?: CloudReport[]; settings?: Partial<Settings> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Touchline export.");
  }
  const ok = data?.app === 'touchline' && Array.isArray(data.players) && Array.isArray(data.sessions)
    && data.players.every((p) => typeof p?.id === 'string' && typeof p?.name === 'string' && /^P\d{2,4}$/.test(p?.token ?? ''))
    && data.sessions.every((x) => typeof x?.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x?.date ?? '') && Array.isArray(x?.notes));
  if (!ok) throw new Error("That file isn't a Touchline export.");
  await store.clearAll();
  await store.putMany(data.players!, data.sessions!);
  for (const r of data.reports ?? []) await store.putReport(r);
  const nextToken = Math.max(1, ...data.players!.map((p) => Number(p.token.slice(1)) + 1));
  const merged = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), onboarded: true, nextToken: Math.max(nextToken, data.settings?.nextToken ?? 1) };
  await store.putSettings(merged);
  players.value = data.players!;
  sessions.value = data.sessions!;
  reports.value = data.reports ?? [];
  settings.value = merged;
  return { players: data.players!.length, sessions: data.sessions!.length };
}

export function exportJson(): string {
  return JSON.stringify(
    { app: 'touchline', version: 1, exportedAt: new Date().toISOString(), players: players.value, sessions: sessions.value, reports: reports.value, settings: settings.value },
    null,
    2,
  );
}

export class CloudDeleteError extends Error {
  constructor(public readonly reason: 'offline' | 'failed') {
    super(reason);
    this.name = 'CloudDeleteError';
  }
}

/**
 * Deletes everything on this phone and, if backup was ever used, every
 * anonymised copy in Firestore first. If the backup can't be reached, nothing
 * is deleted and the coach is told why (no silent half-delete).
 */
export async function deleteEverything() {
  const everBackedUp = settings.value.syncEnabled || sessions.value.some((s) => s.syncedAt);
  if (everBackedUp) {
    if (!online.value) throw new CloudDeleteError('offline');
    try {
      const { deleteAllCloudCopies } = await import('../sync/sync');
      await deleteAllCloudCopies();
    } catch (e) {
      console.warn('Cloud delete failed:', e instanceof Error ? e.name : 'error');
      throw new CloudDeleteError('failed');
    }
  }
  await store.clearAll();
  players.value = [];
  sessions.value = [];
  reports.value = [];
  settings.value = { ...DEFAULT_SETTINGS };
}

export async function getRunner(): Promise<ModelRunner> {
  return (await import('../ai/firebase')).firebaseRunner;
}

export async function getPrompts() {
  return (await import('../ai/firebase')).remotePrompts();
}
