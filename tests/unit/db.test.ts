import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll,
  closeDb,
  db,
  deletePlayer,
  deleteReport,
  deleteSession,
  loadAll,
  putMany,
  putPlayer,
  putReport,
  putSession,
  putSettings,
} from '../../src/data/db';
import { DEFAULT_SETTINGS, type CloudReport, type Settings } from '../../src/lib/types';
import { note, obs, player, session, settings, structured } from './helpers';

function report(id: string): CloudReport {
  return {
    id,
    kind: 'parent_update',
    subject: 'U9 Lions',
    period: '2026-11-16',
    title: 'Week',
    body: 'Body',
    items: [{ playerId: 'p1', text: 'Line' }],
    source: 'in_cloud',
    sentText: 'sent',
    receivedText: 'received',
    model: 'gemini',
    createdAt: 1,
  };
}

beforeEach(async () => {
  await clearAll();
});
afterEach(async () => {
  await closeDb();
});

describe('db', () => {
  it('starts empty with default settings', async () => {
    expect(await loadAll()).toEqual({ players: [], sessions: [], reports: [], settings: DEFAULT_SETTINGS });
  });

  it('round-trips players, sessions, reports and settings', async () => {
    const p = player(1, 'Ollie', ['Oliver'], { archived: true });
    const s = session({ id: 'sx', notes: [note('p1', ['brave'], 'Zoë’s pass')], structured: structured([obs('p1', 'Good')]), demo: true, syncedAt: 5 });
    const st = settings({ coachName: 'Dylan', extraHiddenWords: ['Riverside'], nextToken: 7, theme: 'dark' });
    await putPlayer(p);
    await putSession(s);
    await putReport(report('r1'));
    await putSettings(st);
    await closeDb(); // survives a reconnect
    const all = await loadAll();
    expect(all.players).toEqual([p]);
    expect(all.sessions).toEqual([s]);
    expect(all.reports).toEqual([report('r1')]);
    expect(all.settings).toEqual(st);
  });

  it('put overwrites by id, delete removes', async () => {
    await putPlayer(player(1, 'Ollie'));
    await putPlayer(player(1, 'Oliver'));
    await putPlayer(player(2, 'Amara'));
    await putSession(session({ id: 'a' }));
    await putSession(session({ id: 'b' }));
    await putReport(report('r1'));
    await putReport(report('r2'));
    await deletePlayer('p2');
    await deleteSession('a');
    await deleteReport('r1');
    await deleteReport('missing'); // no-op
    const all = await loadAll();
    expect(all.players.map((p) => p.name)).toEqual(['Oliver']);
    expect(all.sessions.map((s) => s.id)).toEqual(['b']);
    expect(all.reports.map((r) => r.id)).toEqual(['r2']);
  });

  it('merges stored settings over the defaults (older saves lack newer fields)', async () => {
    const d = await db();
    await d.put('meta', { coachName: 'Old save', cloudAllowed: false } satisfies Partial<Settings>, 'settings');
    const { settings: s } = await loadAll();
    expect(s).toEqual({ ...DEFAULT_SETTINGS, coachName: 'Old save', cloudAllowed: false });
  });

  it('putMany writes players and sessions in one go', async () => {
    const players = [player(1, 'Ollie'), player(2, 'Amara')];
    const sessions = [session({ id: 'm1', date: '2026-11-18' }), session({ id: 'm2', date: '2026-11-11' })];
    await putMany(players, sessions);
    const all = await loadAll();
    expect(all.players).toEqual(players);
    expect(all.sessions.map((s) => s.id).sort()).toEqual(['m1', 'm2']);
    await putMany([], []);
    expect((await loadAll()).players).toHaveLength(2);
  });

  it('indexes sessions by date', async () => {
    await putMany([], [session({ id: 'late', date: '2026-11-18' }), session({ id: 'early', date: '2026-10-01' })]);
    const d = await db();
    expect((await d.getAllFromIndex('sessions', 'byDate')).map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('clearAll empties every store, settings included', async () => {
    await putMany([player(1, 'Ollie')], [session({ id: 'c1' })]);
    await putReport(report('r1'));
    await putSettings(settings({ coachName: 'Dylan', onboarded: true }));
    await clearAll();
    expect(await loadAll()).toEqual({ players: [], sessions: [], reports: [], settings: DEFAULT_SETTINGS });
  });

  it('reuses one connection and reopens after closeDb', async () => {
    const a = await db();
    expect(await db()).toBe(a);
    await closeDb();
    await closeDb(); // safe when already closed
    const b = await db();
    expect(b).not.toBe(a);
    expect([...b.objectStoreNames].sort()).toEqual(['meta', 'players', 'reports', 'sessions']);
  });
});
