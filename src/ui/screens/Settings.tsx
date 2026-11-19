import { useEffect, useState } from 'preact/hooks';
import { CloudDeleteError, deleteEverything, hasDemo, importJson, removeDemo, exportJson, nano, nanoProgress, online, sessions, settings, toast, updateSettings } from '../../data/store';
import { NANO_LABEL, nanoStatus } from '../../ai/availability';
import { REMOTE_DEFAULTS, REPO_URL } from '../../ai/config';
import { speechAvailability, installSpeech } from '../../ai/speech';
import { Banner, Sheet, Shell, Switch } from '../components';
import { IconDownload, IconPhone, IconTrash, IconClose, IconMic } from '../icons';
import { navigate } from '../router';

export function SettingsScreen() {
  const s = settings.value;
  const [word, setWord] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>('…');
  const [model, setModel] = useState<string>(REMOTE_DEFAULTS.cloud_model);
  const n = nano.value;
  const synced = sessions.value.filter((x) => x.syncedAt).length;

  useEffect(() => {
    speechAvailability().then(setVoice);
    if (online.value) import('../../ai/firebase').then((m) => m.remoteValue('cloud_model')).then(setModel).catch(() => undefined);
  }, []);

  const addWord = (e: Event) => {
    e.preventDefault();
    const w = word.trim();
    if (w.length < 2 || s.extraHiddenWords.some((x) => x.toLowerCase() === w.toLowerCase())) return setWord('');
    updateSettings({ extraHiddenWords: [...s.extraHiddenWords, w] });
    setWord('');
  };

  const getNano = async () => {
    nanoProgress.value = 0;
    try {
      const { downloadNano } = await import('../../ai/firebase');
      await downloadNano((p) => (nanoProgress.value = p));
      nano.value = await nanoStatus();
      toast(nano.value === 'available' ? 'Gemini Nano is ready on this device.' : 'Download started. Chrome will finish it in the background.');
    } catch {
      toast("Chrome couldn't download Gemini Nano on this device.");
    } finally {
      nanoProgress.value = null;
    }
  };

  const doExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `touchline-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Shell title="Settings">
      <div class="stack narrow">
        <section class="card stack-sm" aria-labelledby="ai-h">
          <h2 id="ai-h" class="title">AI on this device</h2>
          <div class={`banner ${n === 'available' ? 'banner-device' : 'banner-info'}`}>
            <IconPhone />
            <div>
              <strong>{NANO_LABEL[n]}</strong>
              <div class="banner-text small">
                {n === 'available' && 'Session notes and player cards are written on this phone, even with no signal.'}
                {(n === 'downloadable' || n === 'downloading') && 'A one-off download (a few GB) over Wi-Fi. After that it works offline.'}
                {n === 'unavailable' && "This device doesn't meet Chrome's requirements for Gemini Nano. Touchline hides names and uses the cloud instead."}
                {n === 'unsupported' && 'Use Chrome on a laptop or desktop to run AI on-device. Here, Touchline hides names and uses the cloud instead.'}
              </div>
            </div>
          </div>
          {(n === 'downloadable' || n === 'downloading') && (
            <button class="btn btn-secondary" type="button" onClick={getNano} disabled={nanoProgress.value !== null || !online.value}>
              <IconDownload /> {nanoProgress.value !== null ? `Downloading… ${Math.round(nanoProgress.value * 100)}%` : 'Download Gemini Nano'}
            </button>
          )}
          <hr class="divider" />
          <Switch id="cloud" label="Use cloud AI when it helps" checked={s.cloudAllowed} onChange={(v) => updateSettings({ cloudAllowed: v })}
            hint={`Parent updates, 4-week progress, and session notes when Gemini Nano isn't available. Names are always hidden first. Model: ${model}.`} />
          <Switch id="sync" label="Back up anonymised sessions" checked={s.syncEnabled} onChange={(v) => updateSettings({ syncEnabled: v })}
            hint={`Off by default. A copy of each structured session with codes instead of names, in Google Cloud Firestore. No account needed. Pauses while cloud AI is off.${synced ? ` ${synced} backed up so far.` : ''}`} />
        </section>

        <section class="card stack-sm" aria-labelledby="hide-h">
          <h2 id="hide-h" class="title">Also hide these words</h2>
          <p class="small muted">Squad names and nicknames are always hidden. Add anything else that could identify a child: your club, a school, a sibling or a parent's name.</p>
          <form class="row" onSubmit={addWord}>
            <input class="input" spellcheck={false} value={word} maxLength={60} placeholder="e.g. Riverside Juniors" aria-label="Word to hide" onInput={(e) => setWord((e.target as HTMLInputElement).value)} />
            <button class="btn btn-secondary" type="submit" disabled={word.trim().length < 2}>Add</button>
          </form>
          {s.extraHiddenWords.length > 0 && (
            <div class="chips">
              {s.extraHiddenWords.map((w) => (
                <button key={w} type="button" class="chip" aria-label={`Stop hiding ${w}`} onClick={() => updateSettings({ extraHiddenWords: s.extraHiddenWords.filter((x) => x !== w) })}>
                  {w} <IconClose />
                </button>
              ))}
            </div>
          )}
          <p class="small muted">Email addresses and phone numbers are hidden automatically.</p>
        </section>

        <section class="card stack-sm" aria-labelledby="voice-h">
          <h2 id="voice-h" class="title">Voice notes</h2>
          <p class="small">
            {voice === 'available' && 'On. Speech is recognised on this phone; audio never leaves it.'}
            {(voice === 'downloadable' || voice === 'downloading') && "Chrome can recognise speech on this device after a small download."}
            {(voice === 'unavailable' || voice === 'unsupported') && "Off. Voice needs Chrome's on-device speech recognition, which isn't available here. Touchline doesn't use cloud speech, because children's names would leave the phone in the audio."}
          </p>
          {voice === 'downloadable' && (
            <button class="btn btn-secondary" type="button" onClick={async () => {
              toast('Asking Chrome to set up on-device voice…');
              const ok = await installSpeech();
              const now = await speechAvailability();
              setVoice(now);
              toast(now === 'available' ? 'On-device voice is ready. Look for the mic in a player note.' : ok ? 'Chrome is downloading it. Try again in a minute.' : "Chrome couldn't set up on-device voice here.");
            }}>
              <IconMic /> Enable on-device voice
            </button>
          )}
        </section>

        <section class="card stack-sm" aria-labelledby="look-h">
          <h2 id="look-h" class="title">Appearance</h2>
          <div class="chips" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} type="button" role="radio" class="chip" aria-checked={s.theme === t} onClick={() => updateSettings({ theme: t })}>
                {t === 'system' ? 'Match phone' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </section>

        <section class="card stack-sm" aria-labelledby="how-h">
          <h2 id="how-h" class="title">How Touchline uses AI</h2>
          <ol class="stack-sm small" style={{ paddingLeft: '20px', margin: '0px' }}>
            <li><strong>Names become codes first.</strong> On this phone, every squad name becomes a code like P03, and you're asked about any other names before anything is sent.</li>
            <li><strong>Session notes: on the phone where possible.</strong> With Gemini Nano in Chrome, Firebase AI Logic structures notes on the device, even with no signal. Without it, the same request goes to Gemini in the cloud, still as codes.</li>
            <li><strong>Parent updates and progress: in the cloud.</strong> Longer writing across weeks runs on a cloud Gemini model, with codes, back in signal.</li>
            <li><strong>Names come back on the phone.</strong> Every result says where it ran, and "What the cloud saw" shows the exact text that was sent.</li>
          </ol>
        </section>

        <section class="card stack-sm" aria-labelledby="data-h">
          <h2 id="data-h" class="title">Your data</h2>
          <p class="small muted">Your squad and notes live on this phone{s.syncEnabled ? ', with an anonymised backup in the cloud' : ''}. Export a copy any time, move it to a new phone with Import, or wipe it.</p>
          <div class="row wrap">
            <button class="btn btn-secondary" type="button" onClick={doExport}><IconDownload /> Export (JSON)</button>
            <label class="btn btn-secondary" style={{ position: 'relative' }}>
              Import
              <input type="file" accept="application/json,.json" aria-label="Import a Touchline export file"
                style={{ position: 'absolute', inset: '0px', opacity: 0, cursor: 'pointer' }}
                onChange={async (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  (e.target as HTMLInputElement).value = '';
                  if (!f) return;
                  if (!window.confirm('Replace everything on this phone with this file?')) return;
                  try {
                    const r = await importJson(await f.text());
                    toast(`Imported ${r.players} players and ${r.sessions} sessions.`);
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Couldn't import that file.");
                  }
                }} />
            </label>
            {hasDemo.value && <button class="btn btn-secondary" type="button" onClick={async () => { await removeDemo(); toast('Demo squad removed.'); }}>Remove demo squad</button>}
            <button class="btn btn-danger" type="button" onClick={() => setConfirm(true)}><IconTrash /> Delete everything</button>
          </div>
        </section>

        <p class="small" style={{ textAlign: 'center' }}>
          <a href="#/privacy">How Touchline handles data</a>
          {REPO_URL && <> · <a href={REPO_URL} target="_blank" rel="noopener">Source code (Apache-2.0)</a></>}
        </p>
      </div>
      {confirm && (
        <Sheet title="Delete everything?" onClose={() => { setConfirm(false); setDeleteError(null); }}
          actions={<>
            <button class="btn btn-secondary" style={{ flex: 1 }} type="button" onClick={() => setConfirm(false)}>Cancel</button>
            <button class="btn btn-danger" style={{ flex: 1 }} type="button" disabled={deleting} onClick={async () => {
              setDeleting(true);
              try {
                await deleteEverything();
                setConfirm(false);
                navigate({ name: 'today' }, true);
                toast('All data deleted.');
              } catch (e) {
                setDeleteError(e instanceof CloudDeleteError && e.reason === 'offline'
                  ? "You're offline, so the anonymised backup can't be deleted yet. Nothing has been deleted. Try again with signal."
                  : "Couldn't reach the backup to delete it. Nothing has been deleted. Try again in a moment.");
              } finally {
                setDeleting(false);
              }
            }}>{deleting ? 'Deleting…' : 'Delete'}</button>
          </>}>
          <div class="stack-sm">
            <Banner tone="danger">This removes your squad, sessions, cards and reports from this phone{s.syncEnabled || synced ? ', and every anonymised backup in Firestore' : ''}. It can't be undone. Export first if you want a copy.</Banner>
            {deleteError && <Banner tone="warn">{deleteError}</Banner>}
          </div>
        </Sheet>
      )}
    </Shell>
  );
}
