import { useState } from 'preact/hooks';
import { activePlayers, createSession, flagsFor, groups, players, sortedSessions, weeklyCoverage } from '../../data/store';
import { londonDate, relativeDate } from '../../lib/dates';
import type { Session } from '../../lib/types';
import { Empty, Sheet, Shell, SourceBadge } from '../components';
import { IconAlert, IconChevron, IconFlag, IconPlus, PitchArc } from '../icons';
import { href, navigate } from '../router';

const FOCUS_IDEAS = ['Passing and receiving', '1v1 attacking', 'Defending as a team', 'Shooting', 'Small-sided games', 'Dribbling'];

function notedCount(s: Session) {
  return s.notes.filter((n) => n.chips.length || n.text.trim()).length;
}

export function Today() {
  const today = londonDate();
  const allGroups = groups.value;
  const [group, setGroup] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const shownGroup = group ?? (allGroups.length === 1 ? allGroups[0] : null);
  const cov = weeklyCoverage(shownGroup, today);
  const todays = sortedSessions.value.filter((s) => s.date === today && !s.structured);
  const recent = sortedSessions.value.slice(0, 8);
  const waiting = sortedSessions.value.filter((s) => !s.structured && notedCount(s) > 0 && s.date !== today);
  const flags = allGroups.flatMap((g) => flagsFor(g));
  const recentWelfare = sortedSessions.value
    .filter((s) => s.date >= londonDate(new Date(Date.now() - 7 * 86_400_000)))
    .flatMap((s) => (s.structured?.flags ?? []).filter((f) => f.kind === 'welfare').map((f) => ({ ...f, sessionId: s.id })));
  const nameOf = (id: string | null) => players.value.find((p) => p.id === id)?.name;

  if (!activePlayers.value.length) {
    return (
      <Shell title="Touchline">
        <Empty
          title="Add your squad first"
          action={<a class="btn btn-primary btn-lg" href="#/squad"><IconPlus /> Add players</a>}
        >
          First names are enough. They stay on this phone; the AI only ever sees tokens like P03.
        </Empty>
      </Shell>
    );
  }

  const pct = cov.total ? Math.round((cov.covered / cov.total) * 100) : 0;

  return (
    <Shell title="Touchline">
      <div class="today-grid">
      <div class="stack today-main">
        <section class="hero" aria-labelledby="hero-label">
          <PitchArc class="pitch-arc" />
          <div class="row-between">
            <p class="eyebrow" id="hero-label">Feedback this week{shownGroup ? ` · ${shownGroup}` : ''}</p>
            {allGroups.length > 1 && (
              <select class="select" style={{ width: 'auto', minHeight: 36, padding: '4px 10px', background: 'transparent', color: 'inherit', borderColor: 'currentColor' }}
                aria-label="Group" value={shownGroup ?? ''} onChange={(e) => setGroup((e.target as HTMLSelectElement).value || null)}>
                <option value="">All groups</option>
                {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </div>
          <p class="hero-number" style={{ marginTop: 8 }}>
            {cov.covered} <small>of {cov.total} players</small>
          </p>
          <div class="meter" style={{ marginTop: 12 }} role="progressbar" aria-valuemin={0} aria-valuemax={cov.total} aria-valuenow={cov.covered} aria-label="Players with feedback this week">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p class="small" style={{ marginTop: 10, opacity: 0.9 }}>
            {cov.total === 0
              ? 'No players in this group yet.'
              : cov.covered === cov.total
                ? 'Everyone has had a mention in the last 7 days. Lovely.'
                : cov.missing.length <= 4
                  ? `Still to mention: ${cov.missing.map((p) => p.name).join(', ')}.`
                  : `${cov.missing.length} players still to mention in the last 7 days.`}
          </p>
        </section>

        {todays.length ? (
          <a class="btn btn-primary btn-lg btn-block" href={href({ name: 'session', id: todays[0].id })}>
            Continue today's session
          </a>
        ) : (
          <button class="btn btn-primary btn-lg btn-block" type="button" onClick={() => setStarting(true)}>
            <IconPlus /> Start today's session
          </button>
        )}

        {waiting.length > 0 && (
          <a class="card card-link card-tight row" href={href({ name: 'session', id: waiting[0].id })}>
            <IconAlert width={20} height={20} style={{ color: 'var(--warn)' }} />
            <span class="grow small" style={{ flex: 1 }}>
              <strong>{waiting.length} session{waiting.length > 1 ? 's' : ''} saved without AI.</strong> Open to structure when you're ready.
            </span>
            <IconChevron width={20} height={20} />
          </a>
        )}
      </div>

      <div class="today-side">
      {(flags.length > 0 || recentWelfare.length > 0) && (
        <section aria-labelledby="flags-h">
          <div class="section-head"><h2 id="flags-h">Worth a look</h2></div>
          <div class="stack-sm">
            {recentWelfare.map((f, i) => (
              <a key={`w${i}`} class="flag flag-welfare" href={href({ name: 'review', id: f.sessionId })} style={{ textDecoration: 'none' }}>
                <IconAlert />
                <span>{f.note}</span>
              </a>
            ))}
            {flags.map((f, i) => (
              <a key={i} class="flag" href={f.playerId ? href({ name: 'player', id: f.playerId }) : '#/'} style={{ textDecoration: 'none' }}>
                <IconFlag />
                <span>{f.note}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="recent-h">
        <div class="section-head"><h2 id="recent-h">Recent sessions</h2></div>
        {recent.length === 0 ? (
          <p class="muted small">No sessions yet. Your first one takes about two minutes.</p>
        ) : (
          <ul class="list">
            {recent.map((s) => (
              <li key={s.id}>
                <a class="list-row" href={href(s.structured ? { name: 'review', id: s.id } : { name: 'session', id: s.id })}>
                  <div class="grow">
                    <div class="row-between">
                      <strong class="ellipsis">{s.focus || 'Training'}</strong>
                      <span class="small muted num" style={{ flex: 'none' }}>{relativeDate(s.date, today)}</span>
                    </div>
                    <div class="row wrap" style={{ gap: 8, marginTop: 4 }}>
                      <span class="small muted">{s.group} · {s.structured ? s.structured.observations.length : notedCount(s)} noted</span>
                      {s.structured ? <SourceBadge source={s.structured.source} /> : <span class="badge badge-chips">Notes only, not structured yet</span>}
                    </div>
                  </div>
                  <IconChevron class="chev" width={20} height={20} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      </div>

      {starting && <StartSheet groups={allGroups} defaultGroup={shownGroup ?? allGroups[0]} nameOf={nameOf} onClose={() => setStarting(false)} />}
    </Shell>
  );
}

function StartSheet(props: { groups: string[]; defaultGroup: string; nameOf: (id: string) => string | undefined; onClose: () => void }) {
  const [group, setGroup] = useState(props.defaultGroup);
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const count = activePlayers.value.filter((p) => p.group === group).length;
  const start = async (e?: Event) => {
    e?.preventDefault();
    setBusy(true);
    const s = await createSession(group, focus.trim());
    props.onClose();
    navigate({ name: 'session', id: s.id });
  };
  return (
    <Sheet title="Today's session" onClose={props.onClose}
      actions={<button class="btn btn-primary btn-lg btn-block" type="submit" form="start-form" disabled={busy || !count}>Start capturing</button>}>
      <form id="start-form" class="stack" onSubmit={start}>
        {props.groups.length > 1 && (
          <label class="field">
            <span>Group</span>
            <select class="select" value={group} onChange={(e) => setGroup((e.target as HTMLSelectElement).value)}>
              {props.groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
        <label class="field">
          <span>Focus <span class="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <input class="input" spellcheck={false} data-autofocus value={focus} maxLength={80} placeholder="e.g. Passing and receiving" onInput={(e) => setFocus((e.target as HTMLInputElement).value)} />
        </label>
        <div class="chips" aria-label="Focus ideas">
          {FOCUS_IDEAS.map((f) => (
            <button key={f} type="button" class="chip" aria-pressed={focus === f} onClick={() => setFocus(f)}>{f}</button>
          ))}
        </div>
        <p class="small muted">{count} player{count === 1 ? '' : 's'} in {group}. Everyone starts as present; mark anyone missing as you go.</p>
      </form>
    </Sheet>
  );
}
