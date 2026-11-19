import { describe, expect, it } from 'vitest';
import { DEMO_GROUP, demoPlayers, demoSessions } from '../../src/data/demo';
import { historyFlags } from '../../src/lib/flags';
import { addDays } from '../../src/lib/dates';
import { anonymiseSession } from '../../src/sync/anonymise';
import { buildMasker, progressReport, type ModelRunner, type RunRequest } from '../../src/ai/engine';
import { containsWord, settings } from './helpers';

const NOW = 1_763_500_000_000;
const TODAY = '2026-11-19';
const players = demoPlayers(NOW);
const sessions = demoSessions(players, TODAY, NOW);

describe('demo squad', () => {
  it('has 12 unique names and tokens P01 to P12', () => {
    expect(players).toHaveLength(12);
    expect(new Set(players.map((p) => p.name)).size).toBe(12);
    expect(new Set(players.map((p) => p.id)).size).toBe(12);
    expect(players.map((p) => p.token)).toEqual(Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`));
    for (const p of players) {
      expect(p.group).toBe(DEMO_GROUP);
      expect(p.createdAt).toBe(NOW);
    }
  });

  it('builds a valid masker (no alias clashes with another name)', () => {
    const names = players.flatMap((p) => [p.name, ...p.aliases].map((n) => n.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
    expect(() => buildMasker(players, settings())).not.toThrow();
  });
});

describe('demo sessions', () => {
  it('are three past demo sessions, everyone attending', () => {
    expect(sessions.map((s) => s.date)).toEqual([addDays(TODAY, -16), addDays(TODAY, -9), addDays(TODAY, -2)]);
    for (const s of sessions) {
      expect(s.demo).toBe(true);
      expect(s.group).toBe(DEMO_GROUP);
      expect(s.attendees).toEqual(players.map((p) => p.id));
      expect(s.structured!.source).toBe('demo');
      expect(s.notes.map((n) => n.playerId)).toEqual(s.structured!.observations.map((o) => o.playerId));
    }
    expect(sessions[0].createdAt).toBe(NOW - 16 * 86_400_000);
  });

  it('raise Ollie\'s quiet flag and Freya\'s weak-foot pattern flag, and nothing else', () => {
    expect(historyFlags(players, sessions, DEMO_GROUP)).toEqual([
      { playerId: 'demo-p1', kind: 'quiet', note: "Ollie hasn't had a mention in 3 sessions." },
      { playerId: 'demo-p4', kind: 'pattern', note: 'Freya: "Weak foot" noted 3 sessions running. Worth a one-to-one drill?' },
    ]);
  });

  it('are never synced', () => {
    const m = buildMasker(players, settings());
    for (const s of sessions) expect(anonymiseSession(s, players, m)).toBeNull();
  });

  it('feed a progress report without sending a single name', async () => {
    const calls: RunRequest[] = [];
    const run: ModelRunner = async (req) => {
      calls.push(req);
      return { text: '{"progress":"P04 kept improving."}', source: 'in_cloud', model: 'test' };
    };
    const freya = players[3];
    const r = await progressReport(freya, TODAY, sessions, players, settings(), { online: true, nano: 'unavailable', cloudAllowed: true }, run);
    expect(r.body).toBe('Freya kept improving.');
    expect(calls[0].prompt).toContain('3 session record(s)');
    for (const p of players) for (const n of [p.name, ...p.aliases]) expect(containsWord(calls[0].prompt, n), n).toBe(false);
  });

  it('use today by default', () => {
    expect(demoSessions(demoPlayers())).toHaveLength(3);
  });
});
