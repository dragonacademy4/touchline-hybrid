import { useState } from 'preact/hooks';
import { players, removeReport, reports, sessions, settings } from '../../data/store';
import { londonDate, relativeDate, addDays } from '../../lib/dates';
import { progressReport, PROGRESS_DAYS } from '../../ai/engine';
import { Banner, Empty, Shell, SourceBadge } from '../components';
import { IconEdit, IconEyeOff, IconTrend } from '../icons';
import { href } from '../router';
import { CloudRunSheet, ReportView, cloudBlockedReason } from '../cloud';
import { PlayerSheet } from './Squad';

export function PlayerScreen({ id }: { id: string }) {
  const player = players.value.find((p) => p.id === id);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!player) {
    return (
      <Shell title="Player" backTo={{ name: 'squad' }}>
        <Empty title="Player not found" action={<a class="btn btn-primary" href="#/squad">Back to Squad</a>}>They may have been removed.</Empty>
      </Shell>
    );
  }
  const today = londonDate();
  const history = sessions.value
    .filter((s) => s.structured?.observations.some((o) => o.playerId === id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({ s, o: s.structured!.observations.find((o) => o.playerId === id)! }));
  const attended = sessions.value.filter((s) => s.attendees.includes(id)).length;
  const from = addDays(today, -(PROGRESS_DAYS - 1));
  const recentCount = history.filter((h) => h.s.date >= from).length;
  const latest = reports.value.filter((r) => r.kind === 'progress' && r.subject === id).sort((a, b) => b.createdAt - a.createdAt)[0];
  const blocked = cloudBlockedReason();

  return (
    <Shell title={player.name} docTitle="Player" backTo={{ name: 'squad' }}
      actions={<button class="icon-btn" type="button" aria-label={`Edit ${player.name}`} onClick={() => setEditing(true)}><IconEdit /></button>}>
      <div class="stack narrow">
        <div class="row-between wrap">
          <p class="eyebrow">{player.group}</p>
          <span class="badge badge-cloud"><IconEyeOff /> The AI sees "{player.token}"</span>
        </div>
        <div class="grid-2">
          <div class="card card-tight"><p class="hero-number" style={{ fontSize: 'var(--fs-headline)' }}>{history.length}</p><p class="small muted">sessions with feedback</p></div>
          <div class="card card-tight"><p class="hero-number" style={{ fontSize: 'var(--fs-headline)' }}>{attended}</p><p class="small muted">sessions attended</p></div>
        </div>

        <section aria-labelledby="prog-h" class="stack-sm">
          <div class="section-head" style={{ marginTop: 8 }}><h2 id="prog-h">4-week progress</h2></div>
          {latest && <ReportView report={latest} onDelete={() => removeReport(latest.id)} />}
          {recentCount < 2 ? (
            <Banner tone="info" icon={<IconTrend />}>
              {recentCount === 0 ? `No notes for ${player.name} in the last 4 weeks yet.` : `1 session so far. One more session with notes unlocks a 4-week progress report.`}
            </Banner>
          ) : blocked ? (
            <Banner tone="warn">{blocked}</Banner>
          ) : (
            <button class="btn btn-cloud btn-block btn-lg" type="button" onClick={() => setRunning(true)}>
              <IconEyeOff /> {latest ? 'Write a fresh progress report' : 'Write a 4-week progress report'}
            </button>
          )}
          <p class="caption muted">Runs in the cloud across {recentCount} session{recentCount === 1 ? '' : 's'}. {player.name}'s name is replaced with {player.token} before it's sent.</p>
        </section>

        <section aria-labelledby="hist-h">
          <div class="section-head"><h2 id="hist-h">History</h2></div>
          {history.length === 0 ? (
            <p class="muted small">No feedback yet. Add a note in a session and it will appear here.</p>
          ) : (
            <ol class="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {history.map(({ s, o }) => (
                <li key={s.id} class="card card-tight">
                  <div class="row-between wrap" style={{ marginBottom: 6 }}>
                    <a href={href({ name: 'review', id: s.id })}><strong>{relativeDate(s.date, today)}</strong></a>
                    <SourceBadge source={s.structured!.source} />
                  </div>
                  <p class="small"><span class="muted">{s.focus || 'Training'}:</span> {o.strength}</p>
                  <p class="small" style={{ marginTop: 4 }}><span class="muted">Next:</span> {o.nextStep}</p>
                  <a class="small" style={{ display: 'inline-block', marginTop: 8, minHeight: 32 }} href={href({ name: 'card', sessionId: s.id, playerId: id })}>Player card</a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {running && (
        <CloudRunSheet title="4-week progress" involved={[player]}
          job={(run, prompts, c) => progressReport(player, today, sessions.value, players.value, settings.value, c, run, prompts)}
          onDone={() => setRunning(false)} onClose={() => setRunning(false)} />
      )}
      {editing && <PlayerSheet player={player} onClose={() => setEditing(false)} />}
    </Shell>
  );
}
