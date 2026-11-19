import { describe, expect, it } from 'vitest';
import {
  buildParentUpdatePrompt,
  buildProgressPrompt,
  buildSessionPrompt,
  DEFAULT_PARENT_INSTRUCTIONS,
  DEFAULT_PROGRESS_INSTRUCTIONS,
  DEFAULT_SESSION_INSTRUCTIONS,
} from '../../src/lib/prompts';

describe('default instructions', () => {
  it.each([DEFAULT_SESSION_INSTRUCTIONS, DEFAULT_PARENT_INSTRUCTIONS, DEFAULT_PROGRESS_INSTRUCTIONS])('tell the model to keep tokens and never invent names', (t) => {
    expect(t).toMatch(/P03/);
    expect(t).toMatch(/never invent (a )?names?/i);
    expect(t).toMatch(/UK English/);
  });
});

describe('buildSessionPrompt', () => {
  it('lists every player with chip labels by kind and their text', () => {
    const p = buildSessionPrompt({
      date: '2026-11-19',
      group: 'U9 Lions',
      focus: 'Passing',
      generalNotes: '  Wet night.  ',
      players: [
        { token: 'P01', chips: ['brave', 'weak-foot', 'knock', 'not-a-chip'], text: '  Scored twice ' },
        { token: 'P02', chips: [], text: 'Quiet today' },
        { token: 'P03', chips: ['passing'], text: '' },
        { token: 'P04', chips: [], text: '   ' },
      ],
    });
    expect(p.split('\n')).toEqual([
      ...DEFAULT_SESSION_INSTRUCTIONS.split('\n'),
      '',
      'Session: 2026-11-19, group U9 Lions, focus: Passing.',
      "Coach's general notes: Wet night.",
      '',
      'Notes per player:',
      '- P01: + Brave; work on: Weak foot; welfare: Took a knock | Scored twice',
      '- P02: Quiet today',
      '- P03: + Good passing',
      '- P04: (present, no notes)',
      '',
      'Return JSON with one entry in "players" for every player listed above that has notes, a "summary", and "flags".',
    ]);
  });

  it('fills in a blank group and focus and leaves out blank general notes', () => {
    const p = buildSessionPrompt({ date: '2026-11-19', group: '', focus: '', generalNotes: '  ', players: [] }, 'INSTR');
    expect(p.startsWith('INSTR\n\nSession: 2026-11-19, group unnamed, focus: general.\n')).toBe(true);
    expect(p).not.toContain("Coach's general notes");
    expect(p).not.toContain(DEFAULT_SESSION_INSTRUCTIONS);
  });
});

describe('buildParentUpdatePrompt', () => {
  it('lists each session and player line', () => {
    const p = buildParentUpdatePrompt(
      'U9 Lions',
      '2026-11-16',
      [
        { date: '2026-11-16', focus: 'Passing', players: [{ token: 'P01', strength: 'Good touch.', nextStep: 'Left foot.' }] },
        { date: '2026-11-18', focus: '', players: [] },
      ],
      'INSTR',
    );
    expect(p).toBe(
      [
        'INSTR',
        '',
        'Group: U9 Lions. Week beginning 2026-11-16.',
        '',
        'Session 2026-11-16 (focus: Passing):',
        '- P01: did well: Good touch. Next: Left foot.',
        '',
        'Session 2026-11-18 (focus: general):',
        '',
        'Return JSON with "title", "message" and one line per player token in "players".',
      ].join('\n'),
    );
  });
  it('uses the default instructions', () => {
    expect(buildParentUpdatePrompt('G', '2026-11-16', []).startsWith(DEFAULT_PARENT_INSTRUCTIONS)).toBe(true);
  });
});

describe('buildProgressPrompt', () => {
  it('states the token, period and record count', () => {
    const p = buildProgressPrompt(
      'P03',
      '2026-10-23',
      '2026-11-19',
      [
        { date: '2026-10-23', focus: '', strength: 'Brave.', nextStep: 'Talk.' },
        { date: '2026-11-19', focus: 'Shooting', strength: 'Scored.', nextStep: 'Shoot low.' },
      ],
    );
    expect(p.startsWith(DEFAULT_PROGRESS_INSTRUCTIONS)).toBe(true);
    expect(p).toContain('Player: P03. Period: 2026-10-23 to 2026-11-19. 2 session record(s):');
    expect(p).toContain('- 2026-10-23 (focus: general): did well: Brave. Next: Talk.');
    expect(p).toContain('- 2026-11-19 (focus: Shooting): did well: Scored. Next: Shoot low.');
    expect(p.endsWith('Return JSON with "headline", "progress", "strengths", "focus" and "homeIdea".')).toBe(true);
    expect(buildProgressPrompt('P01', 'a', 'b', [], 'X').startsWith('X\n')).toBe(true);
  });
});
