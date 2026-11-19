import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMasker,
  canUseCloud,
  chipsOnlySession,
  DEFAULT_PROMPTS,
  NotEnoughData,
  parentUpdate,
  planSessionRun,
  prepareSessionPrompt,
  PROGRESS_DAYS,
  progressReport,
  sessionsInWeek,
  structureSession,
  type Conditions,
  type ModelRunner,
  type NanoStatus,
  type RunRequest,
  type RunResult,
  type SessionPlan,
} from '../../src/ai/engine';
import { LeakError } from '../../src/lib/mask';
import { PARENT_UPDATE_SCHEMA, ParseError, PROGRESS_SCHEMA, SESSION_SCHEMA } from '../../src/lib/schema';
import type { Session } from '../../src/lib/types';
import { containsWord, note, obs, player, session, settings, structured } from './helpers';

const squad = [
  player(1, 'Ollie', ['Oliver']),
  player(2, 'Amara'),
  player(3, 'Freya'),
  player(4, 'Sam B', ['Sam']),
  player(5, 'Sam K', ['Sam']),
  player(6, 'Kai'),
];
const cfg = settings({ extraHiddenWords: ['Riverside Rovers'] });
/** Every identifying word in the fixtures. None may ever appear in a prompt. */
const SECRET_WORDS = ['Ollie', 'Oliver', 'Amara', 'Freya', 'Sam', 'Kai', 'Riverside', 'Rovers'];

function expectNoNames(text: string) {
  for (const w of SECRET_WORDS) expect(containsWord(text, w), `"${w}" leaked into: ${text}`).toBe(false);
  expect(buildMasker(squad, cfg).findLeaks(text)).toEqual([]);
}

const ONLINE_NANO: Conditions = { online: true, nano: 'available', cloudAllowed: true };
const ONLINE_NO_NANO: Conditions = { online: true, nano: 'unavailable', cloudAllowed: true };

function fakeRunner(reply: string, source: RunResult['source'] = 'on_device', model = 'Gemini Nano') {
  const calls: RunRequest[] = [];
  const run: ModelRunner = async (req) => {
    calls.push(req);
    return { text: reply, source, model };
  };
  return { run, calls };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('planSessionRun', () => {
  const NANO: NanoStatus[] = ['available', 'downloadable', 'downloading', 'unavailable', 'unsupported'];
  const cases: Array<[boolean, NanoStatus, boolean, SessionPlan]> = [];
  for (const online of [true, false]) {
    for (const nano of NANO) {
      for (const cloudAllowed of [true, false]) {
        let expected: SessionPlan;
        if (nano === 'available') {
          expected = { kind: 'model', mode: online && cloudAllowed ? 'prefer_on_device' : 'only_on_device', expect: 'on_device' };
        } else if (online && cloudAllowed) {
          expected = { kind: 'model', mode: 'prefer_on_device', expect: 'in_cloud' };
        } else {
          expected = { kind: 'chips', reason: online ? 'cloud_off_no_nano' : 'offline_no_nano' };
        }
        cases.push([online, nano, cloudAllowed, expected]);
      }
    }
  }

  it('covers all 20 combinations', () => expect(cases).toHaveLength(20));

  it.each(cases)('online=%s nano=%s cloudAllowed=%s', (online, nano, cloudAllowed, expected) => {
    expect(planSessionRun({ online, nano, cloudAllowed })).toEqual(expected);
  });

  it('never routes to the cloud when offline or cloud is off', () => {
    for (const [online, nano, cloudAllowed] of cases) {
      const plan = planSessionRun({ online, nano, cloudAllowed });
      if (!online || !cloudAllowed) {
        expect(plan.kind === 'chips' || plan.mode === 'only_on_device').toBe(true);
      }
    }
  });

  it('canUseCloud needs both signal and permission', () => {
    expect(canUseCloud({ online: true, nano: 'unsupported', cloudAllowed: true })).toBe(true);
    expect(canUseCloud({ online: false, nano: 'available', cloudAllowed: true })).toBe(false);
    expect(canUseCloud({ online: true, nano: 'available', cloudAllowed: false })).toBe(false);
  });
});

describe('buildMasker', () => {
  const m = buildMasker(squad, cfg);
  it('hides names, aliases and extra hidden words', () => {
    const r = m.mask('Oliver and Ollie beat Riverside Rovers, Freya assisted');
    expect(r.text).toBe('[P01] and [P01] beat [X1], [P03] assisted');
    expect(r.restore).toEqual({ '[X1]': 'Riverside Rovers' });
    expect(m.unmask(r.text, r.restore)).toBe('Ollie and Ollie beat Riverside Rovers, Freya assisted');
  });
  it('makes a shared alias ambiguous rather than picking a child', () => {
    const r = m.mask('Sam scored');
    expect(r.text).toBe('[A1] scored');
    expect(m.unmask(r.text, r.restore)).toBe('Sam scored');
  });
  it('works with no extra words and an empty squad', () => {
    expect(buildMasker([], settings()).mask('Ollie').text).toBe('Ollie');
    expect(buildMasker(squad, settings()).mask('Riverside Rovers').text).toBe('Riverside Rovers');
  });
});

describe('chipsOnlySession', () => {
  it('builds plain notes and welfare flags without a model', () => {
    const s = session({
      notes: [note('p1', ['brave', 'weak-foot']), note('p2'), note('p3', [], 'Lovely  goal '), note('p6', ['knock']), note('gone', ['effort'])],
      generalNotes: '  Wet night.  ',
    });
    const out = chipsOnlySession(s, squad);
    expect(out.source).toBe('chips');
    expect(out.model).toBe('none');
    expect(out.sentText).toBe('');
    expect(out.summary).toBe('Wet night.');
    expect(out.createdAt).toBe(1_700_000_000_000);
    expect(out.observations).toEqual([
      {
        playerId: 'p1',
        strength: 'Bravery on the ball.',
        nextStep: 'Keep working on using their weaker foot more.',
        praise: 'Well done Ollie, bravery on the ball today!',
      },
      { playerId: 'p3', strength: "Took part in today's session.", nextStep: 'Keep building on this next week.', praise: 'Thanks for your effort today, Freya!' },
      { playerId: 'gone', strength: 'Real effort.', nextStep: 'Keep building on this next week.', praise: 'Well done Player, real effort today!' },
    ]);
    expect(out.flags).toEqual([{ playerId: 'p6', kind: 'welfare', note: 'Kai took a knock. Check in with their parent or carer.' }]);
  });
});

describe('prepareSessionPrompt', () => {
  const s = session({
    date: '2026-11-18',
    group: "Freya's Five",
    focus: 'Getting Amara and Kai to scan',
    generalNotes: 'Riverside Rovers away next week. Kai was off sick, Ollie covered.',
    notes: [
      note('p1', ['brave'], 'Ollie passed to Freya and Oliver scored'),
      note('p3', ['weak-foot']),
      note('p2'), // present, nothing noted: left out
      note('p4', [], 'Sam set up the goal'),
      note('deleted-player', ['effort'], 'should not appear'),
    ],
  });

  it('builds a prompt with tokens and no names anywhere', () => {
    const { prompt, tokens, restore } = prepareSessionPrompt(s, squad, cfg);
    expectNoNames(prompt);
    expect(prompt).toContain('Session: 2026-11-18, group [P03]\'s Five, focus: Getting [P02] and [P06] to scan.');
    expect(prompt).toContain("Coach's general notes: [X1] away next week. [P06] was off sick, [P01] covered.");
    expect(prompt).toContain('- P01: + Brave | [P01] passed to [P03] and [P01] scored');
    expect(prompt).toContain('- P03: work on: Weak foot');
    expect(prompt).toContain('- P04: [A1] set up the goal');
    expect(prompt).not.toContain('P02:');
    expect(prompt).not.toContain('should not appear');
    expect([...tokens].sort()).toEqual(['P01', 'P03', 'P04']);
    expect(restore).toEqual({ '[X1]': 'Riverside Rovers', '[A1]': 'Sam' });
  });

  it('uses the instructions passed in', () => {
    const { prompt } = prepareSessionPrompt(s, squad, cfg, { ...DEFAULT_PROMPTS, session: 'CUSTOM INSTRUCTIONS' });
    expect(prompt.startsWith('CUSTOM INSTRUCTIONS\n')).toBe(true);
    expect(prompt).not.toContain(DEFAULT_PROMPTS.session);
  });

  it('hides extra hidden words added in settings', () => {
    const t = session({ notes: [note('p1', [], 'Mrs Patel collected him')] });
    const { prompt } = prepareSessionPrompt(t, squad, settings({ extraHiddenWords: ['Mrs Patel'] }));
    expect(prompt).toContain('- P01: [X1] collected him');
    expect(prompt).not.toMatch(/patel/i);
  });

  it('throws LeakError when text that is never masked contains a name (chip label = alias)', () => {
    // "Brave" is a chip label, inserted into the prompt without masking. A child
    // nicknamed "Brave" therefore survives masking, and the leak check must stop it.
    const withAlias = [...squad, player(7, 'Bo', ['Brave'])];
    const t = session({ notes: [note('p1', ['brave'])] });
    expect(() => prepareSessionPrompt(t, withAlias, cfg)).toThrow(LeakError);
    try {
      prepareSessionPrompt(t, withAlias, cfg);
    } catch (e) {
      expect((e as LeakError).leaks).toEqual(['Brave']);
    }
    // Same squad, no chip: fine.
    expect(() => prepareSessionPrompt(session({ notes: [note('p1', [], 'brave run')] }), withAlias, cfg)).not.toThrow();
  });

  it('does not treat the fixed instructions as child data (a child called "An" vs "an empty list")', () => {
    const t = session({ notes: [note('p1', ['brave'])] });
    expect(() => prepareSessionPrompt(t, squad, cfg, { ...DEFAULT_PROMPTS, session: 'Be kind to Freya.' })).not.toThrow();
  });
});

describe('structureSession', () => {
  const s = session({
    date: '2026-11-18',
    focus: 'Passing with Kai',
    generalNotes: 'Riverside Rovers away next week',
    notes: [
      note('p1', ['brave', 'knock', 'upset'], 'Oliver was brilliant'),
      note('p3', ['passing', 'weak-foot']),
      note('p4', [], 'Sam set up the goal'),
      note('p2'),
    ],
  });
  const reply = JSON.stringify({
    players: [
      { player: 'P01', strength: '[P01] was brave on the ball', nextStep: 'Help [P03] with passing', praise: 'Well done P01!' },
      { player: '[p04]', strength: '[A1] set up the goal', next_step: 'Shoot more', praise: 'Great assist!' },
      { player: 'P99', strength: 'Invented player', nextStep: 'x', praise: 'y' },
      { player: 'P02', strength: 'No notes were given for me', nextStep: 'x', praise: 'y' },
    ],
    summary: 'Good session. [X1] away next week.',
    flags: [
      { player: 'P01', note: '[P01] took a knock' },
      { player: '', note: 'Two players forgot shin pads' },
      { player: '', note: 'Two players forgot shin pads' },
      { player: 'P04', note: '[A1] was upset after' },
      { player: 'P99', note: 'Someone limped' },
    ],
  });

  it('sends a masked prompt with the session schema and restores names locally', async () => {
    const { run, calls } = fakeRunner(reply);
    const out = await structureSession(s, squad, cfg, ONLINE_NANO, run);
    expect(calls).toHaveLength(1);
    const req = calls[0];
    expect(req.mode).toBe('prefer_on_device');
    expect(req.purpose).toBe('session');
    expect(req.schema).toBe(SESSION_SCHEMA);
    expectNoNames(req.prompt);
    expect(out.sentText).toBe(req.prompt);
    expect(out.source).toBe('on_device');
    expect(out.model).toBe('Gemini Nano');
    expect(out.createdAt).toBe(1_700_000_000_000);
    expect(out.summary).toBe('Good session. Riverside Rovers away next week.');

    expect(out.observations).toEqual([
      { playerId: 'p1', strength: 'Ollie was brave on the ball', nextStep: 'Help Freya with passing', praise: 'Well done Ollie!' },
      { playerId: 'p4', strength: 'Sam set up the goal', nextStep: 'Shoot more', praise: 'Great assist!' },
      // Skipped by the model: plain record from chips.
      { playerId: 'p3', strength: 'Tidy passing.', nextStep: 'Keep working on using their weaker foot more.', praise: 'Well done Freya, tidy passing today!' },
    ]);
    // P99 (unknown) and P02 (no notes, not in the prompt) are dropped.
    expect(out.observations.map((o) => o.playerId)).not.toContain('p2');
  });

  it('merges welfare flags: every chip flag kept, model repeats dropped', async () => {
    const { run } = fakeRunner(reply);
    const out = await structureSession(s, squad, cfg, ONLINE_NANO, run);
    expect(out.flags).toEqual([
      { playerId: 'p1', kind: 'welfare', note: 'Ollie took a knock. Check in with their parent or carer.' },
      { playerId: 'p1', kind: 'welfare', note: 'Ollie seemed upset. Check in with their parent or carer.' },
      { playerId: null, kind: 'welfare', note: 'Two players forgot shin pads' },
      { playerId: 'p4', kind: 'welfare', note: 'Sam was upset after' },
      { playerId: null, kind: 'welfare', note: 'Someone limped' },
    ]);
  });

  it('keeps distinct model flags for the same player', async () => {
    const r = JSON.stringify({
      players: [],
      summary: 'ok',
      flags: [
        { player: 'P04', note: 'Hurt ankle' },
        { player: 'P04', note: 'Collected late' },
        { player: 'P04', note: 'hurt ankle' },
      ],
    });
    const out = await structureSession(session({ notes: [note('p4', [], 'Sam limped')] }), squad, cfg, ONLINE_NANO, fakeRunner(r).run);
    expect(out.flags.map((f) => f.note)).toEqual(['Hurt ankle', 'Collected late']);
  });

  it.each<[Conditions, RunRequest['mode']]>([
    [{ online: false, nano: 'available', cloudAllowed: true }, 'only_on_device'],
    [{ online: true, nano: 'available', cloudAllowed: false }, 'only_on_device'],
    [{ online: true, nano: 'available', cloudAllowed: true }, 'prefer_on_device'],
    [{ online: true, nano: 'downloadable', cloudAllowed: true }, 'prefer_on_device'],
  ])('passes the planned mode to the runner (%o -> %s)', async (c, mode) => {
    const { run, calls } = fakeRunner(reply);
    await structureSession(s, squad, cfg, c, run);
    expect(calls[0].mode).toBe(mode);
  });

  it('propagates an in-cloud source and model name', async () => {
    const { run } = fakeRunner(reply, 'in_cloud', 'gemini-3.8-flash');
    const out = await structureSession(s, squad, cfg, ONLINE_NO_NANO, run);
    expect(out.source).toBe('in_cloud');
    expect(out.model).toBe('gemini-3.8-flash');
  });

  it.each<Conditions>([
    { online: false, nano: 'unavailable', cloudAllowed: true },
    { online: true, nano: 'downloading', cloudAllowed: false },
  ])('falls back to chips without calling a model (%o)', async (c) => {
    const { run, calls } = fakeRunner(reply);
    const out = await structureSession(s, squad, cfg, c, run);
    expect(calls).toHaveLength(0);
    expect(out.source).toBe('chips');
    expect(out.flags).toHaveLength(2);
  });

  it('skips the model when there is nothing to structure', async () => {
    const { run, calls } = fakeRunner(reply);
    const out = await structureSession(session({ notes: [note('p1')], generalNotes: '   ' }), squad, cfg, ONLINE_NANO, run);
    expect(calls).toHaveLength(0);
    expect(out.source).toBe('chips');
    expect(out.observations).toEqual([]);
  });

  it('runs the model for general notes alone', async () => {
    const { run, calls } = fakeRunner('{"players":[],"summary":"Wet but fun","flags":[]}');
    const out = await structureSession(session({ generalNotes: 'Wet night' }), squad, cfg, ONLINE_NANO, run);
    expect(calls).toHaveLength(1);
    expect(out.summary).toBe('Wet but fun');
  });

  it('gives every noted player a chips record when the model skips them all', async () => {
    const { run } = fakeRunner('{"summary":"Fine"}');
    const out = await structureSession(s, squad, cfg, ONLINE_NANO, run);
    expect(out.observations.map((o) => o.playerId)).toEqual(['p1', 'p3', 'p4']);
    expect(out.observations[2].strength).toBe("Took part in today's session.");
  });

  it('throws ParseError on garbage and leaks nothing', async () => {
    const { run, calls } = fakeRunner('Sorry, I cannot help with that.');
    await expect(structureSession(s, squad, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(ParseError);
    expectNoNames(calls[0].prompt);
  });

  it('refuses to call the model if masking cannot hide a name', async () => {
    const { run, calls } = fakeRunner(reply);
    const withAlias = [...squad, player(7, 'Bo', ['Brave'])];
    await expect(structureSession(s, withAlias, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(LeakError);
    expect(calls).toHaveLength(0);
  });

  it('propagates runner failures', async () => {
    const run: ModelRunner = async () => {
      throw new Error('boom');
    };
    await expect(structureSession(s, squad, cfg, ONLINE_NANO, run)).rejects.toThrow('boom');
  });
});

// Thursday 19 Nov 2026; its week is Mon 16 to Sun 22 Nov.
const TODAY = '2026-11-19';

function weekFixtures(): { sessions: Session[]; inWeek: Session[] } {
  const mon = session({
    date: '2026-11-16',
    focus: 'Passing with Kai',
    structured: structured([obs('p1', 'Passed to Freya well', 'Use the left foot'), obs('p4', 'Sam scored twice'), obs('p5', 'Sam saved one')]),
  });
  const sun = session({ date: '2026-11-22', structured: structured([obs('p3', 'Tackled Kai cleanly'), obs('ghost', 'Not in squad')]) });
  const sessions = [
    sun,
    session({ date: '2026-11-15', structured: structured([obs('p1', 'Previous Sunday')]) }),
    session({ date: '2026-11-23', structured: structured([obs('p1', 'Next Monday')]) }),
    session({ date: '2026-11-18', group: 'U11 Tigers', structured: structured([obs('p2', 'Other group')]) }),
    session({ date: '2026-11-18', notes: [note('p1', ['brave'])] }),
    session({ date: '2026-11-19', structured: structured([]) }),
    mon,
  ];
  return { sessions, inWeek: [mon, sun] };
}

describe('sessionsInWeek', () => {
  it('keeps structured sessions for the group, Monday to Sunday, in date order', () => {
    const { sessions, inWeek } = weekFixtures();
    expect(sessionsInWeek(sessions, 'U9 Lions', TODAY)).toEqual(inWeek);
  });
  it.each(['2026-11-16', '2026-11-19', '2026-11-22'])('any day of the week (%s) gives the same week', (day) => {
    const { sessions, inWeek } = weekFixtures();
    expect(sessionsInWeek(sessions, 'U9 Lions', day)).toEqual(inWeek);
  });
  it('the day after Sunday starts a new week', () => {
    const { sessions } = weekFixtures();
    expect(sessionsInWeek(sessions, 'U9 Lions', '2026-11-23').map((s) => s.date)).toEqual(['2026-11-23']);
    expect(sessionsInWeek(sessions, 'U9 Lions', '2026-11-15').map((s) => s.date)).toEqual(['2026-11-15']);
  });
  it('is empty for an unknown group', () => {
    expect(sessionsInWeek(weekFixtures().sessions, 'Nobody', TODAY)).toEqual([]);
  });
});

describe('parentUpdate', () => {
  const reply = JSON.stringify({
    title: 'A busy week for [P01]',
    message: 'Great effort from everyone. [A1] was everywhere.',
    players: [
      { player: 'P01', line: '[P01] passed well to [P03]' },
      { player: 'P03', line: 'Strong tackling' },
      { player: 'P02', line: 'Not in the records, so dropped' },
      { player: 'P04', line: '[A1] scored' },
    ],
  });

  it('runs only in the cloud with a masked prompt and restores names', async () => {
    const { sessions } = weekFixtures();
    const { run, calls } = fakeRunner(reply, 'in_cloud', 'gemini-3.8-flash');
    const r = await parentUpdate('U9 Lions', TODAY, sessions, squad, cfg, ONLINE_NANO, run);
    const req = calls[0];
    expect(req.mode).toBe('only_in_cloud');
    expect(req.purpose).toBe('parent_update');
    expect(req.schema).toBe(PARENT_UPDATE_SCHEMA);
    expectNoNames(req.prompt);
    expect(req.prompt).toContain('Group: U9 Lions. Week beginning Mon 16 Nov.');
    expect(req.prompt).toContain('Session Mon 16 Nov (focus: Passing with [P06]):');
    expect(req.prompt).toContain('- P01: did well: Passed to [P03] well Next: Use the left foot');
    expect(req.prompt).toContain('Session Sun 22 Nov');
    expect(req.prompt).not.toContain('15 Nov');
    expect(req.prompt).not.toContain('23 Nov');
    expect(req.prompt).not.toContain('Other group');
    expect(req.prompt).not.toContain('Not in squad');

    expect(r).toEqual({
      id: 'pu-U9 Lions-2026-11-16',
      kind: 'parent_update',
      subject: 'U9 Lions',
      period: '2026-11-16',
      title: 'A busy week for Ollie',
      body: 'Great effort from everyone. Sam was everywhere.',
      items: [
        { playerId: 'p1', text: 'Ollie passed well to Freya' },
        { playerId: 'p3', text: 'Strong tackling' },
        { playerId: 'p4', text: 'Sam scored' },
      ],
      source: 'in_cloud',
      sentText: req.prompt,
      receivedText: reply,
      model: 'gemini-3.8-flash',
      createdAt: 1_700_000_000_000,
    });
  });

  it('masks a group named after a child', async () => {
    const s = session({ group: "Freya's Five", date: TODAY, structured: structured([obs('p3', 'Good')]) });
    const { run, calls } = fakeRunner(reply, 'in_cloud');
    const r = await parentUpdate("Freya's Five", TODAY, [s], squad, cfg, ONLINE_NO_NANO, run);
    expect(calls[0].prompt).toContain("Group: [P03]'s Five.");
    expectNoNames(calls[0].prompt);
    expect(r.subject).toBe("Freya's Five");
  });

  it.each<[Conditions, string]>([
    [{ online: false, nano: 'available', cloudAllowed: true }, 'offline'],
    [{ online: true, nano: 'available', cloudAllowed: false }, 'cloud_off'],
    [{ online: false, nano: 'unsupported', cloudAllowed: false }, 'offline'],
  ])('refuses without the cloud (%o)', async (c, msg) => {
    const { run, calls } = fakeRunner(reply);
    await expect(parentUpdate('U9 Lions', TODAY, weekFixtures().sessions, squad, cfg, c, run)).rejects.toThrow(msg);
    expect(calls).toHaveLength(0);
  });

  it('throws NotEnoughData when the week has no structured sessions', async () => {
    const { run, calls } = fakeRunner(reply);
    await expect(parentUpdate('U9 Lions', '2026-11-02', weekFixtures().sessions, squad, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(NotEnoughData);
    await expect(parentUpdate('U11 Tigers', '2026-11-30', [], squad, cfg, ONLINE_NANO, run)).rejects.toThrow(/No structured sessions/);
    expect(calls).toHaveLength(0);
  });

  it('throws ParseError when the update comes back empty', async () => {
    const { run } = fakeRunner('{"title":"x","message":"   "}');
    await expect(parentUpdate('U9 Lions', TODAY, weekFixtures().sessions, squad, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(ParseError);
  });
});

describe('progressReport', () => {
  const ollie = squad[0];
  function fixtures() {
    return [
      session({ date: '2026-10-22', structured: structured([obs('p1', 'Day 29: outside the window')]) }),
      session({ date: '2026-11-19', focus: 'Shooting', structured: structured([obs('p1', 'Scored after a one-two with Sam', 'Shoot low')]) }),
      session({ date: '2026-11-20', structured: structured([obs('p1', 'Future session')]) }),
      session({ date: '2026-11-01', structured: structured([obs('p3', 'Only Freya here')]) }),
      session({ date: '2026-11-05', notes: [note('p1', ['brave'])] }),
      session({ date: '2026-10-23', focus: "Kai's rondo", structured: structured([obs('p1', 'Brave alongside Freya', 'Talk more')]) }),
    ];
  }
  const reply = JSON.stringify({
    headline: '',
    progress: '[P01] grew in confidence alongside [A1].',
    strengths: ['Bravery', 'Passing to [P03]'],
    focus: 'Weak foot',
    home_idea: 'Wall passes',
  });

  it('uses a 28-day window ending today, cloud only, with no names', async () => {
    expect(PROGRESS_DAYS).toBe(28);
    const { run, calls } = fakeRunner(reply, 'in_cloud', 'gemini-3.8-flash');
    const r = await progressReport(ollie, TODAY, fixtures(), squad, cfg, ONLINE_NANO, run);
    const req = calls[0];
    expect(req.mode).toBe('only_in_cloud');
    expect(req.purpose).toBe('progress');
    expect(req.schema).toBe(PROGRESS_SCHEMA);
    expectNoNames(req.prompt);
    expect(req.prompt).toContain('Player: P01. Period: Fri 23 Oct to Thu 19 Nov. 2 session record(s):');
    const lines = req.prompt.split('\n').filter((l) => /^- \w{3} \d+ \w{3} \(/.test(l));
    expect(lines).toEqual([
      '- Fri 23 Oct (focus: [P06]\'s rondo): did well: Brave alongside [P03] Next: Talk more',
      '- Thu 19 Nov (focus: Shooting): did well: Scored after a one-two with [A1] Next: Shoot low',
    ]);

    expect(r).toEqual({
      id: 'pr-p1-2026-11-19',
      kind: 'progress',
      subject: 'p1',
      period: TODAY,
      title: 'Ollie: progress across 2 sessions',
      body: 'Ollie grew in confidence alongside Sam.',
      items: [
        { playerId: null, text: 'Strength: Bravery' },
        { playerId: null, text: 'Strength: Passing to Freya' },
        { playerId: null, text: 'Next focus: Weak foot' },
        { playerId: null, text: 'Try at home: Wall passes' },
      ],
      source: 'in_cloud',
      sentText: req.prompt,
      receivedText: reply,
      model: 'gemini-3.8-flash',
      createdAt: 1_700_000_000_000,
    });
  });

  it('uses the model headline and leaves out empty focus and home idea', async () => {
    const { run } = fakeRunner('{"headline":"[P01] is flying","progress":"Great month.","strengths":["Pace"]}', 'in_cloud');
    const r = await progressReport(ollie, TODAY, fixtures(), squad, cfg, ONLINE_NO_NANO, run);
    expect(r.title).toBe('Ollie is flying');
    expect(r.items).toEqual([{ playerId: null, text: 'Strength: Pace' }]);
  });

  it('needs at least two sessions inside the window', async () => {
    const { run, calls } = fakeRunner(reply);
    const all = fixtures();
    // Only the 19 Nov record and the day-29 record: one inside the window.
    const one = [all[0], all[1]];
    await expect(progressReport(ollie, TODAY, one, squad, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(NotEnoughData);
    await expect(progressReport(ollie, TODAY, [], squad, cfg, ONLINE_NANO, run)).rejects.toThrow('Ollie needs notes from at least 2 sessions');
    // Amara has no observations at all.
    await expect(progressReport(squad[1], TODAY, all, squad, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(NotEnoughData);
    expect(calls).toHaveLength(0);
  });

  it.each<[Conditions, string]>([
    [{ online: false, nano: 'available', cloudAllowed: true }, 'offline'],
    [{ online: true, nano: 'available', cloudAllowed: false }, 'cloud_off'],
  ])('refuses without the cloud (%o)', async (c, msg) => {
    const { run, calls } = fakeRunner(reply);
    await expect(progressReport(ollie, TODAY, fixtures(), squad, cfg, c, run)).rejects.toThrow(msg);
    expect(calls).toHaveLength(0);
  });

  it('throws ParseError when progress is empty', async () => {
    const { run } = fakeRunner('{"headline":"Hi"}');
    await expect(progressReport(ollie, TODAY, fixtures(), squad, cfg, ONLINE_NANO, run)).rejects.toBeInstanceOf(ParseError);
  });
});
