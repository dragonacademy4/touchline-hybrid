import { useState } from 'preact/hooks';
import { loadDemo, nano, online, toast, updateSettings } from '../../data/store';
import { NANO_LABEL } from '../../ai/availability';
import { IconCloud, IconEyeOff, IconPhone, Mark, PitchArc } from '../icons';
import { navigate } from '../router';
import { Spinner, Switch } from '../components';

export function Welcome() {
  const [busy, setBusy] = useState<'demo' | 'own' | null>(null);
  const [backup, setBackup] = useState(false);
  const n = nano.value;
  const nanoReady = n === 'available';

  const startDemo = async () => {
    setBusy('demo');
    try {
      await updateSettings({ syncEnabled: backup });
      await loadDemo();
      navigate({ name: 'today' }, true);
      toast('Demo squad loaded: 12 fictional players and 3 past sessions.');
    } catch {
      toast("Couldn't load the demo. Try again.");
      setBusy(null);
    }
  };
  const startOwn = async () => {
    setBusy('own');
    await updateSettings({ onboarded: true, syncEnabled: backup });
    navigate({ name: 'squad' }, true);
  };

  return (
    <div class="welcome">
      <section class="welcome-top">
        <PitchArc class="pitch-lines" />
        <div class="inner">
          <Mark width={44} height={44} />
          <h1>Feedback for every player, two minutes after training.</h1>
          <p>Pitch-side notes that become praise, next steps and parent updates. Works with no signal.</p>
        </div>
      </section>
      <main class="welcome-body" style={{ maxWidth: 'none', padding: undefined }}>
        <div class="inner stack-lg">
          <div class="stack">
            <div class="promise">
              <span class="ic"><IconPhone /></span>
              <p><strong>Works on the pitch, with no signal</strong><span class="muted small">Notes save on this phone. In Chrome with Gemini Nano, the AI runs on the phone too.</span></p>
            </div>
            <div class="promise">
              <span class="ic"><IconEyeOff /></span>
              <p><strong>Children's names are hidden first</strong><span class="muted small">Before anything reaches the cloud, names become tokens like P03. You can read exactly what was sent.</span></p>
            </div>
            <div class="promise">
              <span class="ic"><IconCloud /></span>
              <p><strong>The cloud only when it helps</strong><span class="muted small">Weekly parent updates and 4-week progress reports run in the cloud, with names hidden.</span></p>
            </div>
          </div>

          <div class={`banner ${nanoReady ? 'banner-device' : 'banner-info'}`} role="status">
            {nanoReady ? <IconPhone /> : <IconCloud />}
            <div>
              <strong>{NANO_LABEL[n]}</strong>
              <div class="banner-text small">
                {nanoReady
                  ? 'Session notes will be structured right here, even in airplane mode.'
                  : n === 'downloadable' || n === 'downloading'
                    ? 'You can download it from Settings. Until then, Touchline hides names and uses the cloud when you have signal.'
                    : `Touchline will hide names and use the cloud when you have signal${online.value ? '' : ' (you are offline right now; notes still save)'}.`}
              </div>
            </div>
          </div>

          <div class="card card-tight">
            <Switch id="welcome-backup" label="Back up anonymised sessions" checked={backup} onChange={setBackup}
              hint="Optional. A copy with tokens instead of names, kept in Google Cloud Firestore under an anonymous sign-in. Change it any time in Settings." />
          </div>

          <div class="stack-sm">
            <button class="btn btn-primary btn-lg btn-block" type="button" onClick={startDemo} disabled={!!busy}>
              {busy === 'demo' ? <Spinner label="Loading demo" /> : null}
              Try the demo squad
            </button>
            <button class="btn btn-secondary btn-lg btn-block" type="button" onClick={startOwn} disabled={!!busy}>
              Start with my own squad
            </button>
            <p class="caption muted" style={{ textAlign: 'center' }}>
              The demo uses 12 made-up players. You can delete it any time in Settings.
            </p>
          </div>
          <p class="footer-note">
            Free and open source (Apache-2.0). <a href="#/privacy">How your data is handled</a>
          </p>
        </div>
      </main>
    </div>
  );
}
