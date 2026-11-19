import { render } from 'preact';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/app.css';
import { App } from './ui/App';
import { init, nano, online, syncNow } from './data/store';
import { nanoStatus } from './ai/availability';

render(<App />, document.getElementById('app')!);

init().then(() => {
  if (navigator.onLine) syncNow();
  // Warm the AI code while there's signal so on-device structuring works after it drops.
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb) : setTimeout(cb, 1500));
  idle(() => {
    import('./ai/firebase').then((m) => m.warmUp()).catch(() => undefined);
    import('./data/store').then((m) => m.getPrompts()).catch(() => undefined);
  });
});

const refreshNano = () => nanoStatus().then((s) => (nano.value = s));
refreshNano();

addEventListener('online', () => {
  online.value = true;
  refreshNano();
  syncNow();
});
addEventListener('offline', () => (online.value = false));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshNano();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
