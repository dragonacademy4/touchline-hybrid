import { useState } from 'preact/hooks';
import { groups, players, removeReport, reports, sessions, settings } from '../../data/store';
import { addDays, londonDate, shortDate, weekStart } from '../../lib/dates';
import { parentUpdate, sessionsInWeek } from '../../ai/engine';
import { Banner, Empty, Shell } from '../components';
import { IconEyeOff, IconMail } from '../icons';
import { CloudRunSheet, ReportView, cloudBlockedReason } from '../cloud';

export function Updates() {
  const today = londonDate();
  const allGroups = groups.value;
  const [group, setGroup] = useState(allGroups[0] ?? '');
  const [week, setWeek] = useState<'this' | 'last'>('this');
  const [running, setRunning] = useState(false);
  const anyDay = week === 'this' ? today : addDays(weekStart(today), -1);
  const from = weekStart(anyDay);
  const inWeek = group ? sessionsInWeek(sessions.value, group, anyDay) : [];
  const involvedIds = new Set(inWeek.flatMap((s) => s.structured!.observations.map((o) => o.playerId)));
  const involved = players.value.filter((p) => involvedIds.has(p.id));
  const saved = reports.value.filter((r) => r.kind === 'parent_update' && (!group || r.subject === group)).sort((a, b) => b.createdAt - a.createdAt);
  const current = saved.find((r) => r.period === from);
  const blocked = cloudBlockedReason();

  if (!allGroups.length) {
    return (
      <Shell title="Parent updates">
        <Empty title="No groups yet" action={<a class="btn btn-primary" href="#/squad">Add players</a>}>Add your squad and run a session, then write the week's update for parents here.</Empty>
      </Shell>
    );
  }

  return (
    <Shell title="Parent updates">
      <div class="stack narrow">
        <p class="muted">A weekly message for parents, written in the cloud from your session notes. Children's names are hidden before it's sent and put back on this phone.</p>
        <div class="grid-2">
          {allGroups.length > 1 ? (
            <label class="field"><span>Group</span>
              <select class="select" value={group} onChange={(e) => setGroup((e.target as HTMLSelectElement).value)}>
                {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          ) : (
            <div class="field"><span>Group</span><p class="input" style={{ display: 'flex', alignItems: 'center', background: 'transparent' }}>{group}</p></div>
          )}
          <label class="field"><span>Week</span>
            <select class="select" value={week} onChange={(e) => setWeek((e.target as HTMLSelectElement).value as 'this' | 'last')}>
              <option value="this">This week</option>
              <option value="last">Last week</option>
            </select>
          </label>
        </div>
        <p class="small muted">Week beginning {shortDate(from, today)} · {inWeek.length} structured session{inWeek.length === 1 ? '' : 's'} · {involved.length} player{involved.length === 1 ? '' : 's'}</p>

        {inWeek.length === 0 ? (
          <Banner tone="info" icon={<IconMail />}>No structured sessions for {group} in this week yet. Capture a session and structure it, then come back.</Banner>
        ) : blocked ? (
          <Banner tone="warn">{blocked}</Banner>
        ) : (
          <button class="btn btn-cloud btn-lg btn-block" type="button" onClick={() => setRunning(true)}>
            <IconEyeOff /> {current ? 'Write it again' : "Write this week's update"}
          </button>
        )}

        {saved.length > 0 && (
          <section class="stack" aria-labelledby="saved-h">
            <div class="section-head"><h2 id="saved-h">Saved updates</h2></div>
            {saved.map((r) => <ReportView key={r.id} report={r} onDelete={() => removeReport(r.id)} />)}
          </section>
        )}
      </div>
      {running && (
        <CloudRunSheet title="Parent update" involved={involved}
          job={(run, prompts, c) => parentUpdate(group, anyDay, sessions.value, players.value, settings.value, c, run, prompts)}
          onDone={() => setRunning(false)} onClose={() => setRunning(false)} />
      )}
    </Shell>
  );
}
