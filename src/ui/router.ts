import { signal } from '@preact/signals';

export type Route =
  | { name: 'today' }
  | { name: 'squad' }
  | { name: 'updates' }
  | { name: 'settings' }
  | { name: 'privacy' }
  | { name: 'session'; id: string }
  | { name: 'review'; id: string }
  | { name: 'player'; id: string }
  | { name: 'card'; sessionId: string; playerId: string };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'squad':
      return { name: 'squad' };
    case 'updates':
      return { name: 'updates' };
    case 'settings':
      return { name: 'settings' };
    case 'privacy':
      return { name: 'privacy' };
    case 'session':
      if (parts[1] && parts[2] === 'review') return { name: 'review', id: parts[1] };
      if (parts[1] && parts[2] === 'card' && parts[3]) return { name: 'card', sessionId: parts[1], playerId: parts[3] };
      if (parts[1]) return { name: 'session', id: parts[1] };
      return { name: 'today' };
    case 'player':
      if (parts[1]) return { name: 'player', id: parts[1] };
      return { name: 'squad' };
    default:
      return { name: 'today' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'today':
      return '#/';
    case 'session':
      return `#/session/${encodeURIComponent(r.id)}`;
    case 'review':
      return `#/session/${encodeURIComponent(r.id)}/review`;
    case 'card':
      return `#/session/${encodeURIComponent(r.sessionId)}/card/${encodeURIComponent(r.playerId)}`;
    case 'player':
      return `#/player/${encodeURIComponent(r.id)}`;
    default:
      return `#/${r.name}`;
  }
}

export const route = signal<Route>(typeof location === 'undefined' ? { name: 'today' } : parse(location.hash));

let depth = 0;

export function navigate(r: Route, replace = false) {
  const h = href(r);
  if (replace) history.replaceState(null, '', h);
  else {
    history.pushState(null, '', h);
    depth++;
  }
  route.value = r;
  window.scrollTo(0, 0);
}

export function back(fallback: Route = { name: 'today' }) {
  if (depth > 0) {
    history.back(); // popstate lowers depth
  } else navigate(fallback, true);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    depth = Math.max(0, depth - 1);
    route.value = parse(location.hash);
  });
  window.addEventListener('hashchange', () => {
    route.value = parse(location.hash);
  });
}
