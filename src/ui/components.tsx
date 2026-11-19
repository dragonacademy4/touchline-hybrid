import type { ComponentChildren, CSSProperties, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { nano, online, settings, toasts } from '../data/store';
import type { Source } from '../lib/types';
import { back, href, route, type Route } from './router';
import {
  IconAlert, IconBack, IconCloud, IconEyeOff, IconGear, IconHome, IconInfo, IconMail, IconPhone, IconTag, IconUsers, IconWifiOff, IconClose, Mark,
} from './icons';

// ---------- Shell ----------

const TABS: Array<{ route: Route; label: string; icon: (p: object) => JSX.Element; match: Route['name'][] }> = [
  { route: { name: 'today' }, label: 'Today', icon: IconHome, match: ['today', 'session', 'review', 'card'] },
  { route: { name: 'squad' }, label: 'Squad', icon: IconUsers, match: ['squad', 'player'] },
  { route: { name: 'updates' }, label: 'Updates', icon: IconMail, match: ['updates'] },
  { route: { name: 'settings' }, label: 'Settings', icon: IconGear, match: ['settings', 'privacy'] },
];

export function Shell(props: { title: string; backTo?: Route; actions?: ComponentChildren; tabs?: boolean; children: ComponentChildren }) {
  const showTabs = props.tabs !== false;
  useEffect(() => {
    document.title = props.title === 'Touchline' ? 'Touchline: pitch-side notes' : `${props.title} · Touchline`;
  }, [props.title]);
  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar-inner">
          {props.backTo ? (
            <button class="back" type="button" onClick={() => back(props.backTo)} aria-label="Back">
              <IconBack width={24} height={24} />
            </button>
          ) : (
            <a class="brand" href="#/" aria-label="Touchline home">
              <Mark />
            </a>
          )}
          <h1>{props.title}</h1>
          <div class="status-row">
            {props.actions}
            <StatusPills />
          </div>
        </div>
      </header>
      <main id="main" class={showTabs ? '' : 'no-tabs'}>{props.children}</main>
      {showTabs && <TabBar />}
      <Toasts />
    </div>
  );
}

function TabBar() {
  const current = route.value.name;
  return (
    <nav class="tabbar" aria-label="Main">
      <div class="tabbar-inner">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.match.includes(current);
          return (
            <a key={t.label} class="tab" href={href(t.route)} aria-current={active ? 'page' : undefined}>
              <Icon />
              {t.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/** Offline indicator plus where AI will run right now. */
export function StatusPills() {
  const isOnline = online.value;
  const n = nano.value;
  const cloud = settings.value.cloudAllowed;
  let ai: { cls: string; label: string; icon: JSX.Element; title: string };
  if (n === 'available') ai = { cls: 'pill-ai-device', label: 'On device', icon: <IconPhone />, title: 'AI runs on this device with Gemini Nano' };
  else if (isOnline && cloud) ai = { cls: 'pill-ai-cloud', label: 'Cloud', icon: <IconEyeOff />, title: 'AI runs in the cloud with names hidden' };
  else ai = { cls: 'pill-ai-none', label: 'Notes only', icon: <IconTag />, title: 'No AI available right now. Notes are saved and can be structured later.' };
  return (
    <>
      {!isOnline && (
        <span class="pill pill-offline" role="status">
          <IconWifiOff /> Offline
        </span>
      )}
      <a class={`pill ${ai.cls}`} href="#/settings" title={ai.title} aria-label={`AI: ${ai.title}`}>
        {ai.icon}
        <span class="pill-label">{ai.label}</span>
      </a>
    </>
  );
}

// ---------- Source badge ----------

const SOURCE: Record<Source, { cls: string; label: string; icon: (p: object) => JSX.Element }> = {
  on_device: { cls: 'badge-device', label: 'On this device', icon: IconPhone },
  in_cloud: { cls: 'badge-cloud', label: 'In the cloud · names hidden', icon: IconEyeOff },
  chips: { cls: 'badge-chips', label: 'From your chips · no AI', icon: IconTag },
  demo: { cls: 'badge-demo', label: 'Demo session', icon: IconInfo },
  coach: { cls: 'badge-coach', label: 'Written by you', icon: IconTag },
};

export function SourceBadge({ source, edited }: { source: Source; edited?: boolean }) {
  const s = SOURCE[source];
  const Icon = s.icon;
  return (
    <span class={`badge ${s.cls}`} data-source={source}>
      <Icon />
      {s.label}
      {edited ? ' · edited' : ''}
    </span>
  );
}

// ---------- Banner ----------

export function Banner(props: { tone: 'warn' | 'info' | 'device' | 'danger'; title?: string; children?: ComponentChildren; icon?: JSX.Element; action?: ComponentChildren }) {
  const icon = props.icon ?? (props.tone === 'warn' || props.tone === 'danger' ? <IconAlert /> : props.tone === 'info' ? <IconCloud /> : <IconPhone />);
  return (
    <div class={`banner banner-${props.tone}`} role={props.tone === 'danger' ? 'alert' : 'status'}>
      {icon}
      <div style={{ flex: 1 }}>
        {props.title && <strong>{props.title}</strong>}
        {props.children && <div class="banner-text">{props.children}</div>}
        {props.action && <div style={{ marginTop: 8 }}>{props.action}</div>}
      </div>
    </div>
  );
}

// ---------- Empty state ----------

export function Empty(props: { title: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <svg class="empty-art" viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="4" y="4" width="112" height="72" rx="4" />
        <path d="M60 4v72" />
        <circle cx="60" cy="40" r="14" />
        <path d="M4 26h14v28H4M116 26h-14v28h14" />
      </svg>
      <h2 class="title">{props.title}</h2>
      <p>{props.children}</p>
      {props.action}
    </div>
  );
}

// ---------- Sheet ----------

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren; labelId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = props.labelId ?? 'sheet-title';
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusables = () => [...el.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, []);
  return (
    <>
      <div class="sheet-backdrop" onClick={props.onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="sheet-head">
          <h2 class="title" id={id}>{props.title}</h2>
          <button class="icon-btn" type="button" onClick={props.onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        {props.children}
        {props.actions && <div class="sheet-actions">{props.actions}</div>}
      </div>
    </>
  );
}

// ---------- Toasts ----------

export function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button type="button" onClick={() => { t.action!.run(); toasts.value = toasts.value.filter((x) => x.id !== t.id); }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Switch ----------

export function Switch(props: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="switch-row">
      <label for={props.id} style={{ flex: 1 }}>
        <strong>{props.label}</strong>
        {props.hint && <span class="small muted" style={{ display: 'block' }}>{props.hint}</span>}
      </label>
      <span class="switch">
        <input id={props.id} type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
        <span aria-hidden="true" />
      </span>
    </div>
  );
}

// ---------- The fold (signature) ----------

/** Shows each name folding into its token before text leaves the device. */
export function Fold({ pairs, play }: { pairs: Array<{ name: string; token: string }>; play: boolean }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => setFolded(true), 60);
    return () => clearTimeout(t);
  }, [play]);
  if (!pairs.length) return null;
  return (
    <div class={`fold ${folded ? 'folded' : ''}`} aria-label={`Names hidden: ${pairs.map((p) => `${p.name} becomes ${p.token}`).join(', ')}`} role="img">
      {pairs.map((p, i) => (
        <span class="fold-item" key={p.token} style={{ '--i': i } as CSSProperties}>
          <span class="fold-face fold-name">{p.name}</span>
          <span class="fold-face fold-token">{p.token}</span>
        </span>
      ))}
    </div>
  );
}

/** "What the model saw": the exact masked text, with tokens highlighted. */
export function Peek({ text, label }: { text: string; label: string }) {
  const parts = text.split(/(\[(?:P\d{2,3}|A\d+|X\d+)\]|\bP\d{2,3}\b)/g);
  return (
    <div class="peek" tabIndex={0} aria-label={label}>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span class="spinner" role={label ? 'status' : undefined} aria-label={label} />;
}

export function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}
