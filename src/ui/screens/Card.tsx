import { useState } from 'preact/hooks';
import { players, sessions, toast } from '../../data/store';
import { shortDate } from '../../lib/dates';
import { Empty, Shell, SourceBadge } from '../components';
import { IconCopy, IconDownload, IconShare, IconStar } from '../icons';

export interface CardData {
  name: string;
  focus: string;
  group: string;
  date: string;
  praise: string;
  nextStep: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the share card (1080×1350, 4:5) on this device. Nothing is uploaded. */
export async function renderCardPng(d: CardData): Promise<Blob> {
  await Promise.all([document.fonts.load('700 160px "Barlow Condensed"'), document.fonts.load('700 44px "Atkinson Hyperlegible"'), document.fonts.load('400 36px "Atkinson Hyperlegible"')]).catch(() => undefined);
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#123b2c';
  ctx.fillRect(0, 0, W, H);
  // Pitch lines
  ctx.strokeStyle = 'rgba(245,243,236,0.16)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(W - 40, 250, 230, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 250);
  ctx.lineTo(W, 250);
  ctx.stroke();
  ctx.strokeRect(-10, H - 260, 420, 300);
  // Header
  ctx.fillStyle = 'rgba(245,243,236,0.85)';
  ctx.font = '700 34px "Atkinson Hyperlegible", sans-serif';
  ctx.fillText(d.group.toUpperCase(), 80, 120);
  if (d.focus) {
    ctx.fillStyle = 'rgba(245,243,236,0.9)';
    ctx.font = '600 56px "Barlow Condensed", sans-serif';
    wrap(ctx, d.focus, W - 360).slice(0, 2).forEach((l, i) => ctx.fillText(l, 80, 196 + i * 60));
  }
  // Star
  ctx.fillStyle = '#e2b84f';
  ctx.beginPath();
  const cx = W - 120, cy = 108, R = 44, r = 19;
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  // Praise and next step, laid out from the bottom up
  const left = 80;
  const maxW = W - 160;
  ctx.font = '400 36px "Atkinson Hyperlegible", sans-serif';
  const nextLines = wrap(ctx, d.nextStep, maxW).slice(0, 3);
  ctx.font = '700 50px "Atkinson Hyperlegible", sans-serif';
  const praiseLines = wrap(ctx, d.praise, maxW).slice(0, 5);
  let y = H - 90 - nextLines.length * 48;
  ctx.fillStyle = 'rgba(245,243,236,0.7)';
  ctx.font = '700 28px "Atkinson Hyperlegible", sans-serif';
  ctx.fillText('NEXT STEP', left, y - 52);
  ctx.fillStyle = '#f5f3ec';
  ctx.font = '400 36px "Atkinson Hyperlegible", sans-serif';
  nextLines.forEach((l, i) => ctx.fillText(l, left, y + i * 48));
  ctx.strokeStyle = 'rgba(245,243,236,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y - 100);
  ctx.lineTo(W - 80, y - 100);
  ctx.stroke();
  y = y - 150 - (praiseLines.length - 1) * 64;
  ctx.font = '700 50px "Atkinson Hyperlegible", sans-serif';
  praiseLines.forEach((l, i) => ctx.fillText(l, left, y + i * 64));
  // Name and date
  ctx.fillStyle = 'rgba(245,243,236,0.8)';
  ctx.font = '400 34px "Atkinson Hyperlegible", sans-serif';
  ctx.fillText(d.date, left, y - 90);
  ctx.fillStyle = '#f5f3ec';
  let size = 190;
  ctx.font = `700 ${size}px "Barlow Condensed", sans-serif`;
  while (ctx.measureText(d.name).width > maxW && size > 90) {
    size -= 10;
    ctx.font = `700 ${size}px "Barlow Condensed", sans-serif`;
  }
  ctx.fillText(d.name, left - 6, y - 140);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the card'))), 'image/png'));
}

export function Card({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const session = sessions.value.find((s) => s.id === sessionId);
  const player = players.value.find((p) => p.id === playerId);
  const obs = session?.structured?.observations.find((o) => o.playerId === playerId);
  const [busy, setBusy] = useState(false);

  if (!session || !player || !obs) {
    return (
      <Shell title="Player card" backTo={{ name: 'today' }}>
        <Empty title="Card not found" action={<a class="btn btn-primary" href="#/">Back to Today</a>}>The session or player may have been deleted.</Empty>
      </Shell>
    );
  }
  const data: CardData = { name: player.name, focus: session.focus, group: session.group, date: shortDate(session.date), praise: obs.praise, nextStep: obs.nextStep };
  const fileName = `${player.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${session.date}.png`;
  const canShareFiles = typeof navigator.canShare === 'function';

  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderCardPng(data);
      const file = new File([blob], fileName, { type: 'image/png' });
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${player.name}'s player card`, text: `${obs.praise} Next step: ${obs.nextStep}` });
      } else {
        download(blob);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast("Couldn't share the card. Try Download instead.");
    } finally {
      setBusy(false);
    }
  };
  const download = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Card saved as an image.');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${player.name}: ${obs.praise}\nNext step: ${obs.nextStep}`);
      toast('Copied.');
    } catch {
      toast("Couldn't copy. Select the text and copy it instead.");
    }
  };

  return (
    <Shell title="Player card" backTo={{ name: 'review', id: sessionId }}>
      <div class="stack" style={{ maxWidth: 440, margin: '0 auto' }}>
        <div class="pcard" role="img" aria-label={`Player card for ${player.name}: ${obs.praise} Next step: ${obs.nextStep}`}>
          <svg class="lines" viewBox="0 0 400 500" fill="none" stroke="#f5f3ec" stroke-width="2.5" aria-hidden="true" preserveAspectRatio="none">
            <circle cx="385" cy="92" r="86" /><path d="M0 92h400" />
          </svg>
          <div class="pc-top">
            <span class="pc-club">{session.group}</span>
            <IconStar class="pc-star" fill="currentColor" stroke="none" />
          </div>
          {session.focus && <div class="pc-focus">{session.focus}</div>}
          <div class="pc-name">{player.name}</div>
          <div class="pc-date">{data.date}</div>
          <p class="pc-praise">{obs.praise}</p>
          <p class="pc-next"><b>Next step</b>{obs.nextStep}</p>
        </div>
        <div class="row" style={{ justifyContent: 'center' }}>
          <SourceBadge source={session.structured!.source} edited={obs.edited} />
        </div>
        <div class="stack-sm">
          <button class="btn btn-primary btn-lg btn-block" type="button" onClick={share} disabled={busy}>
            <IconShare /> {canShareFiles ? 'Share card' : 'Save card'}
          </button>
          <div class="grid-2">
            <button class="btn btn-secondary" type="button" disabled={busy} onClick={async () => download(await renderCardPng(data))}><IconDownload /> Download</button>
            <button class="btn btn-secondary" type="button" onClick={copy}><IconCopy /> Copy text</button>
          </div>
          <p class="caption muted" style={{ textAlign: 'center' }}>The card is drawn on this phone. It only goes where you send it.</p>
        </div>
      </div>
    </Shell>
  );
}
