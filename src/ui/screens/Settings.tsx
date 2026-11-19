import { useEffect, useState } from 'preact/hooks';
import { deleteEverything, exportJson, nano, nanoProgress, online, sessions, settings, toast, updateSettings } from '../../data/store';
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
      <div class="stack">
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
            hint={`Copies of structured sessions with tokens instead of names, stored in Firestore under an anonymous sign-in.${synced ? ` ${synced} backed up so far.` : ''}`} />
        </section>

        <section class="card stack-sm" aria-labelledby="hide-h">
          <h2 id="hide-h" class="title">Also hide these words</h2>
          <p class="small muted">Squad names and nicknames are always hidden. Add anything else that could identify a child: your club, a school, a sibling or a parent's name.</p>
          <form class="row" onSubmit={addWord}>
            <input class="input" value={word} maxLength={60} placeholder="e.g. Riverside Juniors" aria-label="Word to hide" onInput={(e) => setWord((e.target as HTMLInputElement).value)} />
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
            <button class="btn btn-secondary" type="button" onClick={async () => { await installSpeech(); setVoice(await speechAvailability()); }}>
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

        <section class="card stack-sm" aria-labelledby="data-h">
          <h2 id="data-h" class="title">Your data</h2>
          <p class="small muted">Everything lives on this phone. Export a copy any time, or wipe it.</p>
          <div class="row wrap">
            <button class="btn btn-secondary" type="button" onClick={doExport}><IconDownload /> Export (JSON)</button>
            <button class="btn btn-danger" type="button" onClick={() => setConfirm(true)}><IconTrash /> Delete everything</button>
          </div>
        </section>

        <p class="small" style={{ textAlign: 'center' }}>
          <a href="#/privacy">How Touchline handles data</a>
          {REPO_URL && <> · <a href={REPO_URL} target="_blank" rel="noopener">Source code (Apache-2.0)</a></>}
        </p>
      </div>
      {confirm && (
        <Sheet title="Delete everything?" onClose={() => setConfirm(false)}
          actions={<>
            <button class="btn btn-secondary" style={{ flex: 1 }} type="button" onClick={() => setConfirm(false)}>Cancel</button>
            <button class="btn btn-danger" style={{ flex: 1 }} type="button" onClick={async () => { await deleteEverything(); setConfirm(false); navigate({ name: 'today' }, true); toast('All data deleted.'); }}>Delete</button>
          </>}>
          <Banner tone="danger">This removes your squad, sessions, cards and reports from this phone{synced ? ', and the anonymised backups' : ''}. It can't be undone. Export first if you want a copy.</Banner>
        </Sheet>
      )}
    </Shell>
  );
}
