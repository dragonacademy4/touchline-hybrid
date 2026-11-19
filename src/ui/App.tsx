import { useEffect } from 'preact/hooks';
import { loadError, loaded, settings } from '../data/store';
import { route } from './router';
import { Welcome } from './screens/Welcome';
import { Today } from './screens/Today';
import { Capture } from './screens/Capture';
import { Review } from './screens/Review';
import { Card } from './screens/Card';
import { Squad } from './screens/Squad';
import { PlayerScreen } from './screens/Player';
import { Updates } from './screens/Updates';
import { SettingsScreen } from './screens/Settings';
import { Privacy } from './screens/Privacy';
import { Banner } from './components';

function useTheme() {
  const theme = settings.value.theme;
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1c17' : '#f5f3ec');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  useTheme();
  if (!loaded.value) {
    return (
      <div class="shell" aria-busy="true">
        <main>
          <div class="skeleton" style={{ height: '180px', borderRadius: '22px' }} />
          <div class="skeleton" style={{ height: '56px', borderRadius: '999px', marginTop: '16px' }} />
          <div class="skeleton" style={{ height: '200px', borderRadius: '14px', marginTop: '24px' }} />
        </main>
      </div>
    );
  }
  if (loadError.value) {
    return (
      <main style={{ paddingTop: '48px' }}>
        <Banner tone="danger" title="Touchline couldn't open its storage">
          Your browser blocked local storage (private browsing can do this). Open Touchline in a normal Chrome window. ({loadError.value})
        </Banner>
      </main>
    );
  }
  const r = route.value;
  if (!settings.value.onboarded && r.name !== 'privacy') return <Welcome />;
  switch (r.name) {
    case 'today':
      return <Today />;
    case 'session':
      return <Capture id={r.id} />;
    case 'review':
      return <Review id={r.id} />;
    case 'card':
      return <Card sessionId={r.sessionId} playerId={r.playerId} />;
    case 'squad':
      return <Squad />;
    case 'player':
      return <PlayerScreen id={r.id} />;
    case 'updates':
      return <Updates />;
    case 'settings':
      return <SettingsScreen />;
    case 'privacy':
      return <Privacy />;
  }
}
