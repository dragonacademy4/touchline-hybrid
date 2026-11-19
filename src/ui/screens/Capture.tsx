import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { conditions, players, removeSession, restoreSession, saveSession, sessions, setStructured, settings, tick, toast, getRunner, getPrompts } from '../../data/store';
import { CHIPS, type ChipKind } from '../../lib/chips';
import { shortDate } from '../../lib/dates';
import type { Player, PlayerNote, Session } from '../../lib/types';
import { chipsOnlySession, planSessionRun, structureSession } from '../../ai/engine';
import { friendlyError, type FriendlyError } from '../../ai/errors';
import { speechAvailability, startDictation } from '../../ai/speech';
import { Banner, Empty, Fold, Sheet, Shell, Spinner } from '../components';
import { IconCheck, IconCheckCircle, IconCloud, IconEdit, IconEyeOff, IconMic, IconPhone, IconTag, IconTrash } from '../icons';
import { navigate } from '../router';

const KIND_LABEL: Record<ChipKind, string> = { strength: 'Did well', work_on: 'Work on', welfare: 'Welfare' };

function hasNote(n?: PlayerNote) {
  return !!n && (n.chips.length > 0 || n.text.trim().length > 0);
}

export function Capture({ id }: { id: string }) {
  const session = sessions.value.find((s) => s.id === id);
  const [editing, setEditing] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [structuring, setStructuring] = useState(false);
  const [general, setGeneral] = useState(session?.generalNotes ?? '');

  useEffect(() => setGeneral(session?.generalNotes ?? ''), [session?.id]);

  if (!session) {
    return (
      <Shell title="Session" backTo={{ name: 'today' }}>
        <Empty title="Session not found" action={<a class="btn btn-primary" href="#/">Back to Today</a>}>It may have been deleted.</Empty>
      </Shell>
    );
  }

  const squad = players.value
    .filter((p) => session.attendees.includes(p.id) || session.notes.some((n) => n.playerId === p.id) || (p.group === session.group && !p.archived))
    .sort((a, b) => a.name.localeCompare(b.name));
  const noteOf = (pid: string) => session.notes.find((n) => n.playerId === pid);
  const present = squad.filter((p) => session.attendees.includes(p.id));
  const noted = present.filter((p) => hasNote(noteOf(p.id)));
  const plan = planSessionRun(conditions.value);

  const saveGeneral = async () => {
    if (general !== session.generalNotes) await saveSession({ ...session, generalNotes: general });
  };

  const del = async () => {
    const copy = session;
    await removeSession(session.id);
    navigate({ name: 'today' }, true);
    toast('Session deleted.', { label: 'Undo', run: () => restoreSession(copy) }, 6000);
  };

  const cta =
    plan.kind === 'chips'
      ? { label: 'Save notes (no AI right now)', icon: <IconTag /> }
      : plan.expect === 'on_device'
        ? { label: 'Structure on this phone', icon: <IconPhone /> }
        : { label: 'Structure in the cloud', icon: <IconEyeOff /> };

  return (
    <Shell title={shortDate(session.date)} backTo={{ name: 'today' }} tabs={false}
      actions={<button class="icon-btn" type="button" onClick={() => setDetails(true)} aria-label="Edit session details"><IconEdit /></button>}>
      <div class="stack">
        <div>
          <p class="eyebrow">{session.group}</p>
          <p class="title">{session.focus || 'Training'}</p>
        </div>

        {plan.kind === 'chips' && (
          <Banner tone="warn" title={conditions.value.online ? 'Cloud is switched off and Gemini Nano is not available' : 'No signal, and no on-device model here'}>
            Keep going. Notes save on this phone, and you can structure them with AI later.
          </Banner>
        )}

        <section aria-labelledby="players-h">
          <div class="row-between" style={{ marginBottom: 8 }}>
            <h2 id="players-h" class="eyebrow">Players</h2>
            <span class="small muted num" aria-live="polite">{noted.length} of {present.length} noted</span>
          </div>
          {squad.length === 0 ? (
            <Empty title="No players in this group" action={<a class="btn btn-secondary" href="#/squad">Add players</a>}>Add players to {session.group} to capture notes for them.</Empty>
          ) : (
            <div class="player-grid">
              {squad.map((p) => {
                const n = noteOf(p.id);
                const isPresent = session.attendees.includes(p.id);
                const count = (n?.chips.length ?? 0) + (n?.text.trim() ? 1 : 0);
                return (
                  <button key={p.id} type="button" class={`player-tile ${hasNote(n) ? 'has-note' : ''} ${isPresent ? '' : 'absent'}`}
                    onClick={() => setEditing(p.id)} aria-label={`${p.name}: ${!isPresent ? 'not here' : hasNote(n) ? `${count} note${count === 1 ? '' : 's'}` : 'no notes yet'}`}>
                    <span class="name">{p.name}</span>
                    <span class="meta">{!isPresent ? 'Not here today' : hasNote(n) ? `${count} note${count === 1 ? '' : 's'}` : 'Tap to add'}</span>
                    {hasNote(n) && <IconCheckCircle class="tick" />}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <label class="field">
          <span>Whole-group notes <span class="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <textarea class="textarea" value={general} placeholder="How did the session go? Anything for next week?" maxLength={1500}
            onInput={(e) => setGeneral((e.target as HTMLTextAreaElement).value)} onBlur={saveGeneral} />
        </label>

        <div class="stack-sm" style={{ position: 'sticky', bottom: 0, padding: '12px 0 calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(transparent, var(--ground) 25%)' }}>
          <button class="btn btn-primary btn-lg btn-block" type="button" disabled={noted.length === 0 && !general.trim()}
            onClick={async () => { await saveGeneral(); setStructuring(true); }}>
            {cta.icon} {cta.label}
          </button>
          <p class="caption muted" style={{ textAlign: 'center' }}>
            {noted.length === 0 && !general.trim()
              ? 'Add a note for at least one player first.'
              : plan.kind === 'chips'
                ? 'Saved on this phone. Structure with AI later.'
                : plan.expect === 'on_device'
                  ? 'Gemini Nano runs here. Nothing leaves this phone.'
                  : 'Names become tokens like P01 before anything is sent.'}
          </p>
        </div>
      </div>

      {editing && (
        <NoteSheet key={editing} session={session} player={squad.find((p) => p.id === editing)!} squad={squad} onClose={() => setEditing(null)} onNext={(pid) => setEditing(pid)} />
      )}
      {details && <DetailsSheet session={session} onClose={() => setDetails(false)} onDelete={del} />}
      {structuring && <StructureSheet session={{ ...session, generalNotes: general }} onClose={() => setStructuring(false)} />}
    </Shell>
  );
}

function NoteSheet(props: { session: Session; player: Player; squad: Player[]; onClose: () => void; onNext: (id: string) => void }) {
  const { session, player } = props;
  const existing = session.notes.find((n) => n.playerId === player.id);
  const [chips, setChips] = useState<string[]>(existing?.chips ?? []);
  const [text, setText] = useState(existing?.text ?? '');
  const [present, setPresent] = useState(session.attendees.includes(player.id));
  const [voice, setVoice] = useState<'off' | 'ready' | 'listening'>('off');
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let live = true;
    speechAvailability().then((a) => live && a === 'available' && setVoice('ready'));
    return () => {
      live = false;
      stopRef.current?.();
    };
  }, []);

  const toggle = (id: string) => {
    tick();
    setChips((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    if (!present) setPresent(true);
  };

  const persist = async () => {
    stopRef.current?.();
    const notes = session.notes.filter((n) => n.playerId !== player.id);
    if (chips.length || text.trim()) notes.push({ playerId: player.id, chips, text: text.trim() });
    const attendees = present ? [...new Set([...session.attendees, player.id])] : session.attendees.filter((x) => x !== player.id);
    await saveSession({ ...session, notes, attendees });
  };

  const nextPlayer = useMemo(() => {
    const order = props.squad.filter((p) => session.attendees.includes(p.id));
    const idx = order.findIndex((p) => p.id === player.id);
    const after = [...order.slice(idx + 1), ...order.slice(0, Math.max(idx, 0))];
    return after.find((p) => !hasNote(session.notes.find((n) => n.playerId === p.id)));
  }, [player.id]);

  const mic = () => {
    if (voice === 'listening') {
      stopRef.current?.();
      setVoice('ready');
      return;
    }
    setVoice('listening');
    stopRef.current = startDictation(
      (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
      (err) => {
        setVoice('ready');
        if (err && err !== 'aborted' && err !== 'no-speech') toast("Voice stopped. Typing works the same.");
      },
    );
  };

  return (
    <Sheet title={player.name} labelId="note-title" onClose={async () => { await persist(); props.onClose(); }}
      actions={
        <>
          <button class="btn btn-secondary btn-lg" style={{ flex: 1 }} type="button" onClick={async () => { await persist(); props.onClose(); }}>Done</button>
          {nextPlayer && (
            <button class="btn btn-primary btn-lg" style={{ flex: 1.4 }} type="button" onClick={async () => { await persist(); props.onNext(nextPlayer.id); }}>
              Next: {nextPlayer.name}
            </button>
          )}
        </>
      }>
      <div class="stack">
        {(['strength', 'work_on', 'welfare'] as ChipKind[]).map((kind) => (
          <div key={kind}>
            <p class="chip-group-label">{KIND_LABEL[kind]}</p>
            <div class="chips">
              {CHIPS.filter((c) => c.kind === kind).map((c) => (
                <button key={c.id} type="button" class={`chip chip-${kind}`} aria-pressed={chips.includes(c.id)} onClick={() => toggle(c.id)}>
                  {chips.includes(c.id) && <IconCheck />}
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <label class="field">
          <span>Anything else?</span>
          <div style={{ position: 'relative' }}>
            <textarea class="textarea" value={text} maxLength={600} placeholder={`e.g. Scored with his left foot, much braver in the tackle`}
              onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); if (!present) setPresent(true); }} />
          </div>
          <span class="hint">Write names freely. They're hidden before any AI sees this.</span>
        </label>
        {voice !== 'off' && (
          <button type="button" class="btn btn-secondary mic" aria-pressed={voice === 'listening'} onClick={mic}>
            <IconMic /> {voice === 'listening' ? 'Listening on this phone… tap to stop' : 'Speak a note (on this phone)'}
          </button>
        )}
        <label class="switch-row" style={{ minHeight: 48 }}>
          <span><strong>Here today</strong></span>
          <span class="switch">
            <input type="checkbox" role="switch" checked={present} onChange={(e) => setPresent((e.target as HTMLInputElement).checked)} />
            <span aria-hidden="true" />
          </span>
        </label>
      </div>
    </Sheet>
  );
}

function DetailsSheet(props: { session: Session; onClose: () => void; onDelete: () => void }) {
  const [focus, setFocus] = useState(props.session.focus);
  const [date, setDate] = useState(props.session.date);
  const save = async (e: Event) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    await saveSession({ ...props.session, focus: focus.trim(), date });
    props.onClose();
  };
  return (
    <Sheet title="Session details" onClose={props.onClose}
      actions={<>
        <button class="btn btn-danger" type="button" onClick={props.onDelete}><IconTrash /> Delete</button>
        <button class="btn btn-primary" style={{ flex: 1 }} type="submit" form="details-form">Save</button>
      </>}>
      <form id="details-form" class="stack" onSubmit={save}>
        <label class="field"><span>Focus</span>
          <input class="input" value={focus} maxLength={80} onInput={(e) => setFocus((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field"><span>Date</span>
          <input class="input" type="date" value={date} required onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </label>
      </form>
    </Sheet>
  );
}

type Step = 'mask' | 'run' | 'restore' | 'done';

export function StructureSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const plan = planSessionRun(conditions.value);
  const [step, setStep] = useState<Step>('mask');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const notedPlayers = players.value.filter((p) => session.notes.some((n) => n.playerId === p.id && hasNote(n)));
  const pairs = notedPlayers.map((p) => ({ name: p.name, token: p.token }));

  useEffect(() => {
    let live = true;
    setError(null);
    setStep('mask');
    (async () => {
      try {
        if (plan.kind === 'chips') {
          await setStructured(session.id, chipsOnlySession(session, players.value));
          if (live) navigate({ name: 'review', id: session.id }, true);
          return;
        }
        const started = Date.now();
        const [run, prompts] = await Promise.all([getRunner(), getPrompts()]);
        await new Promise((r) => setTimeout(r, 900)); // let the coach see the names fold
        if (!live) return;
        setStep('run');
        const structured = await structureSession(session, players.value, settings.value, conditions.value, run, prompts);
        if (!live) return;
        setStep('restore');
        await new Promise((r) => setTimeout(r, Math.max(0, 1500 - (Date.now() - started)) + 350));
        await setStructured(session.id, structured);
        if (!live) return;
        setStep('done');
        navigate({ name: 'review', id: session.id }, true);
      } catch (e) {
        console.warn('Structuring failed', e);
        if (live) setError(friendlyError(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const runLabel = plan.kind === 'model' && plan.expect === 'on_device' ? 'Gemini Nano is writing feedback on this phone' : 'Sending to the cloud with names hidden';
  const steps: Array<{ id: Step; label: string }> = [
    { id: 'mask', label: 'Hiding names on this phone' },
    { id: 'run', label: runLabel },
    { id: 'restore', label: 'Putting names back, on this phone' },
  ];
  const order: Step[] = ['mask', 'run', 'restore', 'done'];

  return (
    <Sheet title={error ? error.title : 'Structuring notes'} onClose={onClose}
      actions={error ? (
        <>
          <button class="btn btn-secondary" style={{ flex: 1 }} type="button" onClick={async () => { await setStructured(session.id, chipsOnlySession(session, players.value)); navigate({ name: 'review', id: session.id }, true); }}>
            Save without AI
          </button>
          {error.retry && <button class="btn btn-primary" style={{ flex: 1 }} type="button" onClick={() => setAttempt((a) => a + 1)}>Try again</button>}
        </>
      ) : undefined}>
      {error ? (
        <Banner tone="danger">{error.detail}</Banner>
      ) : (
        <div class="stack">
          {pairs.length > 0 && <Fold pairs={pairs} play />}
          <ol class="progress-steps" aria-live="polite">
            {steps.map((s) => {
              const state = order.indexOf(step) > order.indexOf(s.id) ? 'done' : step === s.id ? 'active' : '';
              return (
                <li key={s.id} class={state}>
                  {state === 'done' ? <IconCheck style={{ color: 'var(--device)' }} /> : state === 'active' ? <Spinner /> : <span style={{ width: 18 }} />}
                  {s.label}
                </li>
              );
            })}
          </ol>
          <p class="caption muted">
            {plan.kind === 'model' && plan.expect === 'on_device'
              ? <><IconPhone width={14} height={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Nothing leaves this phone for this step.</>
              : <><IconCloud width={14} height={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> The cloud model only sees tokens like {pairs[0]?.token ?? 'P01'}. You can read exactly what was sent on the next screen.</>}
          </p>
        </div>
      )}
    </Sheet>
  );
}

