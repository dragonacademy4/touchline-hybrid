import { describe, expect, it } from 'vitest';
import { historyFlags, QUIET_SESSIONS } from '../../src/lib/flags';
import type { Session } from '../../src/lib/types';
import { note, obs, player, session, structured } from './helpers';

const G = 'U9 Lions';
const ollie = player(1, 'Ollie');
const amara = player(2, 'Amara');
const all = ['p1', 'p2'];

/** A session everyone attended, with notes only for `noted`. */
function s(date: string, noted: Array<[string, string[]]> = [], extra: Partial<Session> = {}): Session {
  return session({ date, group: G, attendees: all, notes: noted.map(([id, chips]) => note(id, chips)), ...extra });
}

describe('historyFlags: quiet', () => {
  it('flags a player with no mention in their last 3 sessions', () => {
    expect(QUIET_SESSIONS).toBe(3);
    const sessions = [s('2026-11-01', [['p2', ['brave']]]), s('2026-11-08', [['p2', ['brave']]]), s('2026-11-15', [['p2', ['effort']]])];
    expect(historyFlags([ollie, amara], sessions, G)).toEqual([{ playerId: 'p1', kind: 'quiet', note: "Ollie hasn't had a mention in 3 sessions." }]);
  });

  it('needs 3 attended sessions', () => {
    const sessions = [s('2026-11-08'), s('2026-11-15'), s('2026-11-16', [], { attendees: ['p2'] })];
    expect(historyFlags([ollie], sessions, G)).toEqual([]);
  });

  it('counts a text note, a chip or a structured observation as a mention, but not blank text', () => {
    const base = [s('2026-11-01'), s('2026-11-08')];
    expect(historyFlags([ollie], [...base, s('2026-11-15', [], { notes: [note('p1', [], 'Nice')] })], G)).toEqual([]);
    expect(historyFlags([ollie], [...base, s('2026-11-15', [['p1', ['brave']]])], G)).toEqual([]);
    expect(historyFlags([ollie], [...base, s('2026-11-15', [], { structured: structured([obs('p1', 'Good')]) })], G)).toEqual([]);
    expect(historyFlags([ollie], [...base, s('2026-11-15', [], { notes: [note('p1', [], '   ')] })], G)).toHaveLength(1);
  });

  it('only looks at the most recent 3 sessions, by date', () => {
    // Mentioned long ago, quiet since.
    const old = s('2026-10-01', [['p1', ['brave']]], { createdAt: 9_999 });
    expect(historyFlags([ollie], [s('2026-11-15', [], { createdAt: 1 }), old, s('2026-11-01', [], { createdAt: 3 }), s('2026-11-08', [], { createdAt: 2 })], G)).toHaveLength(1);
    // Mentioned most recently.
    expect(historyFlags([ollie], [s('2026-11-01'), s('2026-11-08'), s('2026-11-15'), s('2026-11-16', [['p1', ['brave']]])], G)).toEqual([]);
  });

  it('breaks same-day ties by createdAt, newest first', () => {
    const d = '2026-11-15';
    const sessions = [s(d, [['p1', ['brave']]], { createdAt: 1 }), s(d, [], { createdAt: 4 }), s(d, [], { createdAt: 2 }), s(d, [], { createdAt: 3 })];
    // Newest three (4, 3, 2) have no mention; the mention is in the oldest.
    expect(historyFlags([ollie], sessions, G)).toHaveLength(1);
    // Move the mention to the newest: no flag.
    const flipped = [s(d, [], { createdAt: 1 }), s(d, [['p1', ['brave']]], { createdAt: 4 }), s(d, [], { createdAt: 2 }), s(d, [], { createdAt: 3 })];
    expect(historyFlags([ollie], flipped, G)).toEqual([]);
  });

  it('excludes archived players, players in other groups and sessions of other groups', () => {
    const quiet = [s('2026-11-01'), s('2026-11-08'), s('2026-11-15')];
    expect(historyFlags([{ ...ollie, archived: true }], quiet, G)).toEqual([]);
    expect(historyFlags([{ ...ollie, group: 'U11' }], quiet, G)).toEqual([]);
    const otherGroup = quiet.map((x) => ({ ...x, group: 'U11' }));
    expect(historyFlags([ollie], otherGroup, G)).toEqual([]);
    expect(historyFlags([ollie], quiet, 'U11')).toEqual([]);
  });
});

describe('historyFlags: pattern', () => {
  it('flags the same work-on chip in each of the last 3 sessions', () => {
    const sessions = [s('2026-11-01', [['p2', ['weak-foot', 'brave']]]), s('2026-11-08', [['p2', ['weak-foot', 'brave']]]), s('2026-11-15', [['p2', ['brave', 'weak-foot']]])];
    expect(historyFlags([amara], sessions, G)).toEqual([
      { playerId: 'p2', kind: 'pattern', note: 'Amara: "Weak foot" noted 3 sessions running. Worth a one-to-one drill?' },
    ]);
  });

  it('flags each repeated work-on chip, and not strength or welfare chips', () => {
    const chips = ['talk', 'shooting', 'brave', 'knock'];
    const sessions = [s('2026-11-01', [['p2', chips]]), s('2026-11-08', [['p2', chips]]), s('2026-11-15', [['p2', chips]])];
    expect(historyFlags([amara], sessions, G).map((f) => f.note)).toEqual([
      'Amara: "Talk more" noted 3 sessions running. Worth a one-to-one drill?',
      'Amara: "Shooting" noted 3 sessions running. Worth a one-to-one drill?',
    ]);
  });

  it('needs the chip in every one of the last 3 sessions', () => {
    const gap = [s('2026-11-01', [['p2', ['talk']]]), s('2026-11-08', [['p2', ['brave']]]), s('2026-11-15', [['p2', ['talk']]])];
    expect(historyFlags([amara], gap, G)).toEqual([]);
    // Three in a row, but not the most recent three.
    const old = [s('2026-10-01', [['p2', ['talk']]]), s('2026-10-08', [['p2', ['talk']]]), s('2026-10-15', [['p2', ['talk']]]), s('2026-11-15', [['p2', ['brave']]])];
    expect(historyFlags([amara], old, G)).toEqual([]);
    // Only two sessions.
    expect(historyFlags([amara], gap.slice(1).map((x) => ({ ...x, notes: [note('p2', ['talk'])] })), G)).toEqual([]);
  });

  it('lists the quiet flag before pattern flags, player by player', () => {
    const sessions = [s('2026-11-01', [['p2', ['talk']]]), s('2026-11-08', [['p2', ['talk']]]), s('2026-11-15', [['p2', ['talk']]])];
    expect(historyFlags([ollie, amara], sessions, G).map((f) => `${f.playerId}:${f.kind}`)).toEqual(['p1:quiet', 'p2:pattern']);
  });
});
