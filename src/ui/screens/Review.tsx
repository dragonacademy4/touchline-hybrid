import { useEffect, useState } from 'preact/hooks';
import { aiFailedAt, conditions, players, saveSession, sessions, syncNow } from '../../data/store';
import { shortDate } from '../../lib/dates';
import type { PlayerObservation, Session } from '../../lib/types';
import { planSessionRun } from '../../ai/engine';
import { Banner, Empty, Peek, Sheet, Shell, SourceBadge, flagLabel } from '../components';
import { IconArrowUp, IconChevron, IconEdit, IconFlag, IconAlert, IconStar, IconCheckCircle, IconSparkle } from '../icons';
import { href } from '../router';
import { StructureSheet } from './Capture';

export function Review({ id }: { id: string }) {
  const session = sessions.value.find((s) => s.id === id);
  const [editing, setEditing] = useState<PlayerObservation | null>(null);
  const [rerun, setRerun] = useState(false);

  useEffect(() => {
    // Back in signal: send the anonymised copy.
    if (session?.structured && !session.demo) syncNow();
  }, [session?.structured?.createdAt]);

  if (!session || !session.structured) {
    return (
      <Shell title="Session" backTo={{ name: 'today' }}>
        <Empty title="Nothing to review yet" action={session ? <a class="btn btn-primary" href={href({ name: 'session', id })}>Back to notes</a> : <a class="btn btn-primary" href="#/">Back to Today</a>}>
          {session ? 'Structure the notes first.' : 'This session may have been deleted.'}
        </Empty>
      </Shell>
    );
  }
  const st = session.structured;
  const nameOf = (pid: string | null) => players.value.find((p) => p.id === pid)?.name ?? 'Player';
  const plan = planSessionRun(conditions.value);
  const canUpgrade = st.source === 'chips' && plan.kind === 'model';
  const obs = [...st.observations].sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)));

  return (
    <Shell title={shortDate(session.date)} backTo={{ name: 'today' }}>
      <div class="stack">
        <div class="row-between wrap">
          <div>
            <p class="eyebrow">{session.group}</p>
            <p class="title">{session.focus || 'Training'}</p>
          </div>
          <SourceBadge source={st.source} />
        </div>

        {canUpgrade && (aiFailedAt.value && Date.now() - aiFailedAt.value < 5 * 60_000 ? (
          <Banner tone="warn" title="AI couldn't be reached just now"
            action={<button class="btn btn-secondary" type="button" onClick={() => setRerun(true)}>Try AI again</button>}>
            These notes were saved from your chips. You can try again now or later.
          </Banner>
        ) : (
          <Banner tone="info" title="AI can write this up now" icon={<IconSparkle />}
            action={<button class="btn btn-primary" type="button" onClick={() => setRerun(true)}>Structure with AI</button>}>
            These notes were saved from your chips without AI. Turn them into proper feedback now.
          </Banner>
        ))}

        {st.summary && (
          <section class="card" aria-labelledby="sum-h">
            <h2 id="sum-h" class="eyebrow" style={{ marginBottom: '6px' }}>Session summary</h2>
            <p>{st.summary}</p>
          </section>
        )}

        {st.flags.length > 0 && (
          <section aria-labelledby="flags-h2" class="stack-sm">
            <h2 id="flags-h2" class="eyebrow">Flags</h2>
            {st.flags.map((f, i) => (
              <div key={i} class={`flag ${f.kind === 'welfare' ? 'flag-welfare' : ''}`}>
                {f.kind === 'welfare' ? <IconAlert /> : <IconFlag />}
                <span>{flagLabel(f, (id) => players.value.find((p) => p.id === id)?.name)}</span>
              </div>
            ))}
          </section>
        )}

        <section aria-labelledby="obs-h">
          <div class="section-head"><h2 id="obs-h">Players ({obs.length})</h2></div>
          {obs.length === 0 ? (
            <p class="muted small">No player notes in this session.</p>
          ) : (
            <div class="stack-sm obs-grid">
              {obs.map((o) => (
                <article key={o.playerId} class="card" aria-labelledby={`o-${o.playerId}`}>
                  <div class="row-between" style={{ marginBottom: '10px' }}>
                    <h3 id={`o-${o.playerId}`} class="title">{nameOf(o.playerId)}</h3>
                    <div class="row" style={{ gap: '4px' }}>
                      <button class="icon-btn" type="button" aria-label={`Edit feedback for ${nameOf(o.playerId)}`} onClick={() => setEditing(o)}><IconEdit /></button>
                    </div>
                  </div>
                  <div class="obs">
                    <div class="obs-item obs-strength"><IconCheckCircle /><div><div class="k">Did well</div>{o.strength}</div></div>
                    <div class="obs-item obs-next"><IconArrowUp /><div><div class="k">Next step</div>{o.nextStep}</div></div>
                    <div class="obs-item obs-praise"><IconStar /><div><div class="k">For the player</div>"{o.praise}"</div></div>
                  </div>
                  <div class="row wrap" style={{ marginTop: '12px', gap: '8px' }}>
                    <a class="btn btn-secondary" href={href({ name: 'card', sessionId: session.id, playerId: o.playerId })}>Player card <IconChevron /></a>
                    {o.edited && <span class="badge badge-coach">Edited by you</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {st.sentText && (
          <details class="disclosure card">
            <summary><IconChevron class="chev-r" /> {st.source === 'on_device' ? 'What the on-device model saw' : 'What the cloud saw'}</summary>
            <p class="small muted" style={{ margin: '4px 0 10px' }}>
              Names were swapped for tokens on this phone before {st.source === 'on_device' ? 'Gemini Nano' : `the cloud model (${st.model})`} saw this. The token list never leaves the phone.
            </p>
            <Peek text={st.sentText} label="Exact text sent to the model" />
          </details>
        )}

        <div class="row wrap">
          <a class="btn btn-primary" href="#/">Done</a>
          <a class="btn btn-secondary" href={href({ name: 'session', id: session.id })}><IconEdit /> Edit notes</a>
          {plan.kind === 'model' && st.source !== 'chips' && !session.demo && (
            <button class="btn btn-ghost" type="button" onClick={() => setRerun(true)}>
              {st.observations.some((o) => o.edited) ? 'Run again (replaces your edits)' : 'Run again'}
            </button>
          )}
        </div>
        {session.syncedAt && <p class="caption muted">Anonymised copy synced (tokens only, no names).</p>}
      </div>

      {editing && <EditObservation session={session} obs={editing} name={nameOf(editing.playerId)} onClose={() => setEditing(null)} />}
      {rerun && <StructureSheet session={session} onClose={() => setRerun(false)} />}
    </Shell>
  );
}

function EditObservation(props: { session: Session; obs: PlayerObservation; name: string; onClose: () => void }) {
  const [o, setO] = useState(props.obs);
  const save = async (e: Event) => {
    e.preventDefault();
    const st = props.session.structured!;
    const observations = st.observations.map((x) => (x.playerId === o.playerId ? { ...o, strength: o.strength.trim(), nextStep: o.nextStep.trim(), praise: o.praise.trim(), edited: true } : x));
    await saveSession({ ...props.session, structured: { ...st, observations } });
    props.onClose();
  };
  const field = (k: 'strength' | 'nextStep' | 'praise', label: string) => (
    <label class="field">
      <span>{label}</span>
      <textarea class="textarea" style={{ minHeight: '80px' }} value={o[k]} maxLength={400} required onInput={(e) => setO({ ...o, [k]: (e.target as HTMLTextAreaElement).value })} />
    </label>
  );
  return (
    <Sheet title={`Edit: ${props.name}`} onClose={props.onClose}
      actions={<button class="btn btn-primary btn-block btn-lg" type="submit" form="edit-obs">Save</button>}>
      <form id="edit-obs" class="stack" onSubmit={save}>
        {field('strength', 'Did well')}
        {field('nextStep', 'Next step')}
        {field('praise', 'For the player')}
      </form>
    </Sheet>
  );
}

