/** The "Check before it goes" step: likely names outside the squad, hidden by default. */
import { useState } from 'preact/hooks';
import { settings, updateSettings } from '../data/store';
import type { ConfirmSend } from '../ai/engine';
import { Peek } from './components';
import { IconCheck, IconEyeOff } from './icons';

interface Pending {
  prompt: string;
  suspects: string[];
  resolve: (hide: string[] | null) => void;
}

/** Returns a ConfirmSend for the engine plus the panel to render while it waits. */
export function useSendCheck(): { confirm: ConfirmSend; pending: Pending | null; panel: preact.JSX.Element | null } {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm: ConfirmSend = (check) =>
    new Promise((resolve) => setPending({ ...check, resolve: (hide) => { setPending(null); resolve(hide); } }));
  return { confirm, pending, panel: pending ? <CheckPanel key={pending.prompt} pending={pending} /> : null };
}

function CheckPanel({ pending }: { pending: Pending }) {
  const [hide, setHide] = useState<string[]>(pending.suspects);
  const [always, setAlways] = useState(true);
  const toggle = (w: string) => setHide((h) => (h.includes(w) ? h.filter((x) => x !== w) : [...h, w]));
  const send = async () => {
    if (always && hide.length) {
      const existing = new Set(settings.value.extraHiddenWords.map((w) => w.toLowerCase()));
      await updateSettings({ extraHiddenWords: [...settings.value.extraHiddenWords, ...hide.filter((w) => !existing.has(w.toLowerCase()))] });
    }
    pending.resolve(hide);
  };
  return (
    <div class="stack" data-testid="send-check">
      <div class="banner banner-info" role="status">
        <IconEyeOff />
        <div>
          <strong>Check before it goes</strong>
          <div class="banner-text small">Your squad's names are already hidden. These words look like other people's names. Hide them too?</div>
        </div>
      </div>
      <div class="chips" role="group" aria-label="Words to hide">
        {pending.suspects.map((w) => (
          <button key={w} type="button" class="chip chip-strength" aria-pressed={hide.includes(w)} onClick={() => toggle(w)}>
            {hide.includes(w) && <IconCheck />} {w}
          </button>
        ))}
      </div>
      <label class="row small" style={{ minHeight: '44px' }}>
        <input type="checkbox" checked={always} onChange={(e) => setAlways((e.target as HTMLInputElement).checked)} style={{ width: '20px', height: '20px' }} />
        Always hide the ticked words (you can change this in Settings)
      </label>
      <details class="disclosure">
        <summary>Show the text before hiding</summary>
        <Peek text={pending.prompt} label="Text that would be sent, before hiding these words" />
      </details>
      <div class="row wrap" style={{ gap: '8px' }}>
        <button class="btn btn-ghost" type="button" onClick={() => pending.resolve(null)}>Cancel</button>
        <button class="btn btn-primary" style={{ flex: 1 }} type="button" onClick={send}>
          {hide.length ? `Hide ${hide.length} and send` : 'Send as it is'}
        </button>
      </div>
    </div>
  );
}
