/** Shared UI for the cloud-only reports (parent updates and 4-week progress). */
import { useEffect, useState } from 'preact/hooks';
import { conditions, getRunner, getPrompts, players, saveReport, settings, toast } from '../data/store';
import { NotEnoughData } from '../ai/engine';
import type { Conditions, ConfirmSend, ModelRunner, Prompts } from '../ai/engine';
import { SendCancelled } from '../ai/engine';
import { useSendCheck } from './sendCheck';
import { friendlyError, type FriendlyError } from '../ai/errors';
import type { CloudReport, Player } from '../lib/types';
import { Banner, Fold, Peek, Sheet, SourceBadge, Spinner } from './components';
import { IconCheck, IconChevron, IconCopy, IconTrash } from './icons';

type Job = (run: ModelRunner, prompts: Prompts, c: Conditions, confirm: ConfirmSend) => Promise<CloudReport>;

export function CloudRunSheet(props: { title: string; involved: Player[]; job: Job; onDone: (r: CloudReport) => void; onClose: () => void }) {
  const [step, setStep] = useState<'mask' | 'run' | 'restore'>('mask');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pairs = props.involved.map((p) => ({ name: p.name, token: p.token }));
  const check = useSendCheck();

  useEffect(() => {
    let live = true;
    setError(null);
    setStep('mask');
    (async () => {
      try {
        const [run, prompts] = await Promise.all([getRunner(), getPrompts()]);
        await new Promise((r) => setTimeout(r, 900));
        if (!live) return;
        setStep('run');
        const report = await props.job(run, prompts, conditions.value, check.confirm);
        if (!live) return;
        setStep('restore');
        await new Promise((r) => setTimeout(r, 450));
        await saveReport(report);
        if (live) props.onDone(report);
      } catch (e) {
        if (e instanceof SendCancelled) return props.onClose();
        console.warn('Cloud report failed:', e instanceof Error ? e.name : 'error');
        if (!live) return;
        if (e instanceof NotEnoughData) setError({ kind: 'unknown', title: 'Not enough notes yet', detail: e.message, retry: false });
        else setError(friendlyError(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const order = ['mask', 'run', 'restore'];
  const steps = [
    { id: 'mask', label: 'Hiding names on this phone' },
    { id: 'run', label: 'Writing it in the cloud, names hidden' },
    { id: 'restore', label: 'Putting names back, on this phone' },
  ];
  return (
    <Sheet title={error ? error.title : props.title} onClose={props.onClose}
      actions={error?.retry ? <button class="btn btn-primary btn-block" type="button" onClick={() => setAttempt((a) => a + 1)}>Try again</button> : undefined}>
      {error ? (
        <Banner tone={error.kind === 'unknown' && !error.retry ? 'info' : 'danger'}>{error.detail}</Banner>
      ) : check.panel ? (
        check.panel
      ) : (
        <div class="stack">
          <Fold pairs={pairs} play />
          <ol class="progress-steps" aria-live="polite">
            {steps.map((s) => {
              const state = order.indexOf(step) > order.indexOf(s.id) ? 'done' : step === s.id ? 'active' : '';
              return (
                <li key={s.id} class={state}>
                  {state === 'done' ? <IconCheck style={{ color: 'var(--device)' }} /> : state === 'active' ? <Spinner /> : <span style={{ width: '18px' }} />}
                  {s.label}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Sheet>
  );
}

export function ReportView({ report, onDelete }: { report: CloudReport; onDelete?: () => void }) {
  const nameOf = (id: string | null) => players.value.find((p) => p.id === id)?.name;
  const full = [report.title, '', report.body, '', ...report.items.map((i) => (i.playerId ? `${nameOf(i.playerId) ?? 'Player'}: ${i.text}` : i.text))].join('\n');
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it into your parents group.');
    } catch {
      toast("Couldn't copy. Select the text and copy it instead.");
    }
  };
  return (
    <article class="card stack" aria-label={report.title}>
      <div class="row-between wrap">
        <SourceBadge source={report.source} />
        <span class="caption muted">{new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {report.model}</span>
      </div>
      <h3 class="title">{report.title}</h3>
      <p style={{ whiteSpace: 'pre-line' }}>{report.body}</p>
      {report.items.length > 0 && (
        <ul class="stack-sm" style={{ paddingLeft: '18px', margin: '0px' }}>
          {report.items.map((i, k) => (
            <li key={k}>{i.playerId ? <><strong>{nameOf(i.playerId) ?? 'Player'}:</strong> {i.text}</> : i.text}</li>
          ))}
        </ul>
      )}
      <div class="row wrap">
        <button class="btn btn-primary" type="button" onClick={() => copy(full)}><IconCopy /> Copy</button>
        {onDelete && <button class="btn btn-ghost" type="button" onClick={onDelete}><IconTrash /> Delete</button>}
      </div>
      <details class="disclosure">
        <summary><IconChevron class="chev-r" /> What the cloud saw</summary>
        <p class="small muted" style={{ margin: '4px 0 10px' }}>This is the exact text sent to {report.model}. Names were swapped for tokens on this phone first, and swapped back here after.</p>
        <Peek text={report.sentText} label="Exact text sent to the cloud" />
        <p class="small muted" style={{ margin: '12px 0 6px' }}>And what came back, before names were put back:</p>
        <Peek text={report.receivedText} label="Exact text returned by the cloud" />
      </details>
    </article>
  );
}

export function cloudBlockedReason(): string | null {
  const c = conditions.value;
  if (!c.online) return "You're offline. Cloud reports need signal; everything else works.";
  if (!settings.value.cloudAllowed) return 'Cloud AI is switched off in Settings.';
  return null;
}
