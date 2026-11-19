/**
 * JSON Schemas for structured output, and tolerant parsers for what comes back.
 *
 * The same schema object is passed to Gemini Nano on-device
 * (onDeviceParams.promptOptions.responseConstraint) and to the cloud model
 * (generationConfig.responseJsonSchema), so both paths return the same shape.
 * Models still slip up (code fences, missing fields, unknown players), so every
 * response goes through a parser that keeps what's usable and drops the rest.
 */

const str = (description: string) => ({ type: 'string', description });

export const SESSION_SCHEMA = {
  type: 'object',
  properties: {
    players: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          player: str('The player token exactly as given, e.g. P03'),
          strength: str('One sentence: what the player did well, specific to the notes'),
          nextStep: str('One sentence: one concrete thing to work on next session'),
          praise: str('One short, warm sentence addressed to the child, suitable for age 6-12'),
        },
        required: ['player', 'strength', 'nextStep', 'praise'],
      },
    },
    summary: str('Two or three sentences for the coach: how the session went and what to plan next'),
    flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          player: str('Player token, or empty string for the whole group'),
          note: str('A welfare or safeguarding concern mentioned in the notes (injury, upset, missing kit)'),
        },
        required: ['player', 'note'],
      },
    },
  },
  required: ['players', 'summary', 'flags'],
} as const;

export const PARENT_UPDATE_SCHEMA = {
  type: 'object',
  properties: {
    title: str('A short, friendly title for the weekly update'),
    message: str('The update for all parents in the group: 80-140 words, warm, plain UK English'),
    players: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          player: str('Player token exactly as given'),
          line: str('One sentence for this child\'s parents: a specific positive and what they are working on'),
        },
        required: ['player', 'line'],
      },
    },
  },
  required: ['title', 'message', 'players'],
} as const;

export const PROGRESS_SCHEMA = {
  type: 'object',
  properties: {
    headline: str('One sentence summarising the player\'s progress over the period'),
    progress: str('A paragraph (60-120 words) on how the player has developed, citing specific sessions'),
    strengths: { type: 'array', items: str('A consistent strength, a few words') },
    focus: str('The single most useful thing to work on next'),
    homeIdea: str('One simple practice idea to try at home with a ball, 5-10 minutes'),
  },
  required: ['headline', 'progress', 'strengths', 'focus', 'homeIdea'],
} as const;

export class ParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Extracts the first JSON object from model text (handles code fences and chatter). */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new ParseError('The model did not return valid JSON.', raw);
}

const MAX = { sentence: 400, paragraph: 1500 };

function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function normToken(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^\s*\[?\s*(P\d{2,4})\s*\]?\s*$/i.exec(v);
  return m ? m[1].toUpperCase() : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export interface ParsedSession {
  players: Array<{ token: string; strength: string; nextStep: string; praise: string }>;
  summary: string;
  flags: Array<{ token: string | null; note: string }>;
}

/** Parses session output, keeping only tokens in `allowed` and one entry per player. */
export function parseSession(raw: string, allowed: ReadonlySet<string>): ParsedSession {
  const o = obj(extractJson(raw));
  const seen = new Set<string>();
  const players: ParsedSession['players'] = [];
  for (const item of arr(o.players)) {
    const p = obj(item);
    const token = normToken(p.player);
    if (!token || !allowed.has(token) || seen.has(token)) continue;
    const entry = {
      token,
      strength: text(p.strength, MAX.sentence),
      nextStep: text(p.nextStep ?? p.next_step, MAX.sentence),
      praise: text(p.praise, MAX.sentence),
    };
    if (!entry.strength && !entry.nextStep && !entry.praise) continue;
    seen.add(token);
    players.push(entry);
  }
  const flags: ParsedSession['flags'] = [];
  for (const item of arr(o.flags)) {
    const f = obj(item);
    const note = text(f.note, MAX.sentence);
    if (!note) continue;
    const token = normToken(f.player);
    flags.push({ token: token && allowed.has(token) ? token : null, note });
  }
  const summary = text(o.summary, MAX.paragraph);
  if (!players.length && !summary) throw new ParseError('The model returned no usable notes.', raw);
  return { players, summary, flags };
}

export interface ParsedParentUpdate {
  title: string;
  message: string;
  players: Array<{ token: string; line: string }>;
}

export function parseParentUpdate(raw: string, allowed: ReadonlySet<string>): ParsedParentUpdate {
  const o = obj(extractJson(raw));
  const message = text(o.message, MAX.paragraph);
  if (!message) throw new ParseError('The update came back empty.', raw);
  const seen = new Set<string>();
  const players: ParsedParentUpdate['players'] = [];
  for (const item of arr(o.players)) {
    const p = obj(item);
    const token = normToken(p.player);
    const line = text(p.line, MAX.sentence);
    if (!token || !allowed.has(token) || seen.has(token) || !line) continue;
    seen.add(token);
    players.push({ token, line });
  }
  return { title: text(o.title, 120) || 'This week at training', message, players };
}

export interface ParsedProgress {
  headline: string;
  progress: string;
  strengths: string[];
  focus: string;
  homeIdea: string;
}

export function parseProgress(raw: string): ParsedProgress {
  const o = obj(extractJson(raw));
  const progress = text(o.progress, MAX.paragraph);
  if (!progress) throw new ParseError('The progress report came back empty.', raw);
  return {
    headline: text(o.headline, MAX.sentence),
    progress,
    strengths: arr(o.strengths).map((s) => text(s, 80)).filter(Boolean).slice(0, 5),
    focus: text(o.focus, MAX.sentence),
    homeIdea: text(o.homeIdea ?? o.home_idea, MAX.sentence),
  };
}
