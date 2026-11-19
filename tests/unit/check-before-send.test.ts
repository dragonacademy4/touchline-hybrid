import { describe, expect, it } from 'vitest';
import { parentUpdate, progressReport, SendCancelled, structureSession, type ConfirmSend, type RunRequest } from '../../src/ai/engine';
import { note, obs, player, session, settings, structured } from './helpers';

const squad = [player(1, 'Ollie'), player(2, 'Amara')];
const cfg = settings();
const online = { online: true, nano: 'unavailable' as const, cloudAllowed: true };
const offlineNano = { online: false, nano: 'available' as const, cloudAllowed: true };
const reply = JSON.stringify({ players: [{ player: 'P01', strength: '[P01] was kind to [X1].', nextStep: 'Keep going.', praise: 'Great, [P01]!' }], summary: 'Good.', flags: [] });

function runner(text = reply) {
  const calls: RunRequest[] = [];
  return { calls, run: async (r: RunRequest) => (calls.push(r), { text, source: 'in_cloud' as const, model: 'm' }) };
}

const s = session({ attendees: ['p1', 'p2'], notes: [note('p1', ['brave'], 'Ollie helped Mason up, mum Sarah Jones watched')] });

describe('check before send', () => {
  it('asks about non-squad names and hides the chosen ones before sending', async () => {
    const { calls, run } = runner();
    const asked: string[][] = [];
    const confirm: ConfirmSend = async ({ suspects, prompt }) => {
      asked.push(suspects);
      expect(prompt).toContain('Mason');
      return suspects;
    };
    const r = await structureSession(s, squad, cfg, online, run, undefined, confirm);
    expect(asked).toEqual([['Mason', 'Sarah Jones']]);
    expect(calls[0].prompt).not.toMatch(/Mason|Sarah|Jones/);
    expect(calls[0].prompt).toContain('[P01] helped [X1] up, mum [X2] watched');
    // Restored on the device.
    expect(r.observations[0].strength).toBe('Ollie was kind to Mason.');
  });
  it('sends unchanged when the coach hides nothing', async () => {
    const { calls, run } = runner();
    await structureSession(s, squad, cfg, online, run, undefined, async () => []);
    expect(calls[0].prompt).toContain('Mason');
  });
  it('cancel sends nothing', async () => {
    const { calls, run } = runner();
    await expect(structureSession(s, squad, cfg, online, run, undefined, async () => null)).rejects.toBeInstanceOf(SendCancelled);
    expect(calls).toHaveLength(0);
  });
  it('does not ask when nothing looks like a name', async () => {
    const { run } = runner();
    let asked = false;
    await structureSession(session({ attendees: ['p1'], notes: [note('p1', ['brave'], 'Great effort')] }), squad, cfg, online, run, undefined, async () => ((asked = true), []));
    expect(asked).toBe(false);
  });
  it('does not ask on the only_on_device path (nothing can leave)', async () => {
    const { run } = runner();
    let asked = false;
    await structureSession(s, squad, cfg, offlineNano, run, undefined, async () => ((asked = true), []));
    expect(asked).toBe(false);
  });
  it('applies to the parent update and progress report too', async () => {
    const day = '2026-11-19';
    const past = [
      session({ id: 'a', date: '2026-11-17', group: 'U9', attendees: ['p1'], structured: structured([obs('p1', 'Passed to Kayden')]) }),
      session({ id: 'b', date: '2026-11-18', group: 'U9', attendees: ['p1'], structured: structured([obs('p1', 'Again with Kayden')]) }),
    ];
    const pu = runner(JSON.stringify({ title: 't', message: 'm', players: [] }));
    const seen: string[][] = [];
    await parentUpdate('U9', day, past, squad, cfg, online, pu.run, undefined, async ({ suspects }) => (seen.push(suspects), suspects));
    expect(pu.calls[0].prompt).not.toContain('Kayden');
    const pr = runner(JSON.stringify({ headline: 'h', progress: 'p', strengths: [], focus: '', homeIdea: '' }));
    await progressReport(squad[0], day, past, squad, cfg, online, pr.run, undefined, async ({ suspects }) => (seen.push(suspects), suspects));
    expect(pr.calls[0].prompt).not.toContain('Kayden');
    expect(seen).toEqual([['Kayden'], ['Kayden']]);
  });
});
