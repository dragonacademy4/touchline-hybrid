/**
 * Name masking: the privacy promise of Touchline.
 *
 * Before any text goes to a model (on-device or cloud), every child's name and
 * nickname is swapped for a stable token such as "[P03]". The token-to-name map
 * never leaves the device. When a result comes back, tokens are swapped back
 * locally.
 *
 * Matching rules (each one is covered by tests in tests/unit/mask.test.ts and
 * tests/unit/mask.adversarial.test.ts):
 * - Whole words only, so "Max" is hidden but "maximum" is left alone.
 * - Case- and accent-insensitive: "zoe", "ZOË" and "Zoë" all match "Zoë". Letters
 *   with no accent to strip fold to their plain form too ("Lukasz" matches
 *   "Łukasz", "Isil" matches "Işıl", "Soren" matches "Søren"), as do full-width
 *   and styled letters ("Ｏｌｌｉｅ", "𝐎𝐥𝐥𝐢𝐞").
 * - Invisible characters (zero-width spaces and joiners, soft hyphens, Arabic
 *   tatweel) are ignored inside a name: "Ol\u200Blie" is still Ollie.
 * - Curly and straight apostrophes and hyphen variants are treated alike, and a
 *   hyphen or apostrophe may be left out or typed as a space: "Mary Jane",
 *   "MaryJane" and "Ciaran ONeill" are all hidden.
 * - Possessives work: "Ollie's" becomes "[P03]'s".
 * - A plural or possessive without an apostrophe ("Ollies", "the two Maxes") is
 *   hidden too. Lowercase ("ollies") counts only for names of three or more
 *   letters that are not everyday words, and a name ending in "s" never takes a
 *   bare "s", so lowercase "has" and "wills", and "less" in any case, are never touched.
 * - A camelCase join ("#OllieForCaptain") is a word boundary, and so is any
 *   letter in a script written without spaces (Chinese, Japanese, Thai...).
 * - Longest match wins, so "Mary-Jane" is not split into "Mary" + "-Jane".
 * - A name shared by two children (two "Sam"s) becomes an ambiguous token that
 *   restores to the exact words typed, so it never points at the wrong child.
 * - Names that are also everyday words (Will, Grace, Hope, Mark...) are hidden
 *   only when capitalised, so "he will need to" stays readable. Lowercase
 *   "will" does not identify anyone.
 * - Extra words the coach chooses (club, school, a parent's name) are hidden too,
 *   as are email addresses and phone numbers. An email address is hidden whole,
 *   even when it starts with a name ("ollie.smith@...").
 * - Object keys are masked by maskDeep as well as values.
 */

import { COMMON_WORD_NAMES } from './commonWords';

export interface MaskMember {
  /** Stable token id, e.g. "P03". Never reused. */
  token: string;
  /** Display name, e.g. "Ollie". */
  name: string;
  /** Nicknames and other spellings, e.g. ["Oliver", "Ol"]. */
  aliases?: string[];
}

export interface MaskOptions {
  members: MaskMember[];
  /** Extra words or phrases to hide (club, school, siblings, parents). */
  extraTerms?: string[];
}

export interface MaskHit {
  token: string;
  surface: string;
  kind: 'player' | 'ambiguous' | 'extra' | 'email' | 'phone';
}

export interface MaskResult {
  text: string;
  hits: MaskHit[];
  /** Restores for non-player tokens, e.g. "[A1]" -> "Sam". Keep on device. */
  restore: Record<string, string>;
}

const PLAYER_TOKEN_RE = /^P\d{2,3}$/;
const MIN_TERM_LENGTH = 2;

/** Letters and combining marks continue a word; digits and punctuation end it. */
const LETTER = /[\p{L}\p{M}]/u;

/** Characters that render as nothing (or as a stretch of the line) and are dropped when folding. */
const INVISIBLE = /[\p{Cf}\u0640]/u;
/** Scripts written without spaces between words: any letter in them is a word boundary. */
const NO_SPACE_SCRIPT = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]/u;
/** Letters that Unicode does not decompose but people type without the mark. */
const LETTER_FOLDS: Record<string, string> = {
  ß: 'ss', ı: 'i', ł: 'l', ø: 'o', đ: 'd', ð: 'd', æ: 'ae', œ: 'oe', þ: 'th', ħ: 'h', ŧ: 't', ς: 'σ',
};
const LETTER_FOLDS_RE = /[ßıłøđðæœþħŧς]/g;

const APOSTROPHES = /['‘’‛ʼʻ′`´]/g;
const DASHES = /[‐‑‒–—−-]/g;

interface Folded {
  text: string;
  /** For each index in `text`, the index in the original string it came from. */
  map: number[];
}

const foldCache = new Map<string, string>();

/** Folds one non-ASCII character: '' if invisible, ' ' if whitespace. Cached, as notes repeat characters. */
function foldChar(ch: string): string {
  let f = foldCache.get(ch);
  if (f !== undefined) return f;
  if (INVISIBLE.test(ch)) f = '';
  else if (/\s/u.test(ch)) f = ' ';
  else {
    // NFKD only for letters, so "Ｏ" becomes "o" but "™" does not become "tm".
    f = ch.normalize(LETTER.test(ch) ? 'NFKD' : 'NFD').replace(/\p{M}/gu, '').toLowerCase();
    f = f.replace(APOSTROPHES, "'").replace(DASHES, '-').replace(LETTER_FOLDS_RE, (c) => LETTER_FOLDS[c]);
  }
  if (foldCache.size < 10_000) foldCache.set(ch, f);
  return f;
}

/**
 * Folds text for matching: lowercase, accents and invisible characters removed,
 * compatibility letters (full-width, styled) and undecomposable letters (ł, ø,
 * ı...) made plain, apostrophes and dashes unified, runs of whitespace collapsed
 * to one space. Keeps a map back to the original indices so matches can be
 * replaced in the original text.
 */
export function fold(input: string): Folded {
  let text = '';
  const map: number[] = [];
  let i = 0;
  let lastWasSpace = false;
  for (const ch of input) {
    const start = i;
    i += ch.length;
    const ascii = ch.charCodeAt(0) < 0x80;
    const f = ascii ? (ch === '`' ? "'" : ch.toLowerCase()) : foldChar(ch);
    if (f === '') continue; // invisible, or a lone combining mark
    if (f === ' ' || (ascii && ch >= '\t' && ch <= '\r')) {
      if (!lastWasSpace) {
        text += ' ';
        map.push(start);
      }
      lastWasSpace = true;
      continue;
    }
    lastWasSpace = false;
    text += f;
    // One map entry per UTF-16 unit, so astral characters keep indices aligned.
    for (let k = 0; k < f.length; k++) map.push(start);
  }
  return { text, map };
}

function foldTerm(term: string): string {
  return fold(term.trim()).text.trim();
}

interface Term {
  folded: string;
  /** Player tokens this term can refer to. Empty for extra terms. */
  tokens: Set<string>;
  extra: boolean;
  commonWord: boolean;
}

function buildTerms(opts: MaskOptions): Term[] {
  const byFolded = new Map<string, Term>();
  const add = (raw: string, token: string | null) => {
    const base = foldTerm(raw);
    // "Mary-Jane" is also typed "Mary Jane" or "MaryJane"; "O'Neill" as "O Neill" or "ONeill".
    for (const v of new Set([base, base.replace(/[-']/g, ' '), base.replace(/[-']/g, '')])) addFolded(v, token);
  };
  const addFolded = (folded: string, token: string | null) => {
    if ([...folded].length < MIN_TERM_LENGTH || !/[\p{L}\p{N}]/u.test(folded)) return;
    let term = byFolded.get(folded);
    if (!term) {
      term = {
        folded,
        tokens: new Set(),
        extra: false,
        commonWord: COMMON_WORD_NAMES.has(folded),
      };
      byFolded.set(folded, term);
    }
    if (token) term.tokens.add(token);
    else term.extra = true;
  };
  for (const m of opts.members) {
    add(m.name, m.token);
    for (const a of m.aliases ?? []) add(a, m.token);
  }
  for (const t of opts.extraTerms ?? []) add(t, null);
  // Extra terms that are also player names count as player names.
  for (const term of byFolded.values()) if (term.tokens.size > 0) term.extra = false;
  // Longest first so "mary-jane" wins over "mary".
  return [...byFolded.values()].sort((a, b) => b.folded.length - a.folded.length);
}

function isUpper(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.normalize('NFKC'); // styled capitals such as "𝐖" count
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

function isLower(ch: string): boolean {
  return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
}

// The lookbehind makes the regex start only at the beginning of a run, so long text stays linear.
const EMAIL_RE = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// UK-style and international phone numbers: 10+ digits with optional spaces, dashes, brackets, leading +.
const PHONE_RE = /(?<![\p{L}\p{N}])\+?\(?\d[\d\s().-]{8,}\d(?![\p{L}\p{N}])/gu;

interface Contact {
  start: number;
  end: number;
  kind: 'email' | 'phone';
  surface: string;
}

/** Finds email addresses and phone numbers, emails first, without overlaps. */
function findContacts(text: string): Contact[] {
  const out: Contact[] = [];
  for (const [re, kind] of [
    [EMAIL_RE, 'email'],
    [PHONE_RE, 'phone'],
  ] as const) {
    for (const m of text.matchAll(re)) {
      const digits = m[0].replace(/\D/g, '');
      if (kind === 'phone' && (digits.length < 10 || digits.length > 15)) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (out.some((c) => start < c.end && end > c.start)) continue;
      out.push({ start, end, kind, surface: m[0] });
    }
  }
  return out;
}

/** Neutralises anything in the input that already looks like one of our tokens. */
function neutraliseTokens(text: string): string {
  return text
    .replace(/\[\s*((?:P\d{2,3})|(?:A\d+)|(?:X\d+))\s*\]/gi, '#$1')
    .replace(/(?<![\p{L}\p{N}_#])(P\d{2,3})(?![\p{L}\p{N}_])/gu, '#$1');
}

interface Span {
  start: number;
  end: number; // exclusive, in original text
  token: string;
  kind: MaskHit['kind'];
  /** Suffix that stays visible after the token, e.g. "s" for "Ollies". */
  keepSuffix?: string;
}

export interface Masker {
  /** Pass the same `shared` map for every field of one payload so tokens stay consistent. */
  mask(text: string, shared?: Record<string, string>): MaskResult;
  unmask(text: string, restore?: Record<string, string>): string;
  /** Returns any names or hidden words still present in `text`. Empty means safe. */
  findLeaks(text: string): string[];
}

export function createMasker(opts: MaskOptions): Masker {
  for (const m of opts.members) {
    if (!PLAYER_TOKEN_RE.test(m.token)) throw new Error(`Bad player token: ${m.token}`);
  }
  const terms = buildTerms(opts);
  // Terms grouped by first folded character, still longest first.
  const termsByFirst = new Map<string, Term[]>();
  for (const t of terms) {
    const list = termsByFirst.get(t.folded[0]) ?? [];
    list.push(t);
    termsByFirst.set(t.folded[0], list);
  }
  const nameByToken = new Map(opts.members.map((m) => [m.token, m.name.trim()]));

  /** Finds name/term spans in `text` (original indices). */
  function findSpans(text: string): Array<Span & { term: Term; surface: string }> {
    const out: Array<Span & { term: Term; surface: string }> = [];
    if (!terms.length) return out;
    const f = fold(text);
    const ft = f.text;
    const origEnd = (fIdx: number) => {
      // End (exclusive) in the original text of the character at folded index fIdx.
      const o = f.map[fIdx];
      let e = o + (text.codePointAt(o)! > 0xffff ? 2 : 1);
      while (e < text.length && /\p{M}/u.test(text[e])) e++;
      return e;
    };
    const charAt = (o: number) => String.fromCodePoint(text.codePointAt(o)!);
    /** True when folded characters i-1 and i are letters of one word in the original text. */
    const sameWord = (i: number) => {
      if (i <= 0 || i >= ft.length || !LETTER.test(ft[i - 1]) || !LETTER.test(ft[i])) return false;
      const a = f.map[i - 1];
      const b = f.map[i];
      if (a === b) return true; // one character folded to two, e.g. "ß" -> "ss"
      const ca = text.charCodeAt(a);
      const cb = text.charCodeAt(b);
      if (b === a + 1 && ca < 0x80 && cb < 0x80) return !(ca >= 97 && ca <= 122 && cb >= 65 && cb <= 90); // fast path
      const prev = charAt(a);
      const next = charAt(b);
      if (INVISIBLE.test(text.slice(a, b))) return false; // "x\u200BOllie"
      if (NO_SPACE_SCRIPT.test(prev) || NO_SPACE_SCRIPT.test(next)) return false;
      return !(isLower(prev) && isUpper(next)); // camelCase: "#GoOllie"
    };
    let pos = 0;
    while (pos < ft.length) {
      if (sameWord(pos)) {
        pos++;
        continue;
      }
      let matched = false;
      for (const term of termsByFirst.get(ft[pos]) ?? []) {
        if (!ft.startsWith(term.folded, pos)) continue;
        let fEnd = pos + term.folded.length;
        const start = f.map[pos];
        const firstStr = charAt(start);
        let keepSuffix: string | undefined;
        if (sameWord(fEnd)) {
          // A plural or possessive without apostrophe ("Ollies", "Maxes") still names a child.
          const upper = isUpper(firstStr);
          let n = 0;
          if (ft[fEnd] === 's' && !sameWord(fEnd + 1) && !term.folded.endsWith('s')) {
            // Two-letter names need care: "Ha" + "s" is "Has", "Jo" + "s" is "Jos".
            if ([...term.folded].length >= 3 && (upper || !term.commonWord)) n = 1;
          } else if (upper && ft.startsWith('es', fEnd) && /(?:[sxz]|ch|sh)$/.test(term.folded) && !sameWord(fEnd + 2)) {
            n = 2;
          }
          if (!n) continue; // part of a longer word, e.g. "maximum"
          keepSuffix = text.slice(f.map[fEnd], origEnd(fEnd + n - 1));
          fEnd += n;
        }
        if (term.commonWord && !isUpper(firstStr)) continue;
        const end = origEnd(fEnd - 1);
        out.push({
          start,
          end,
          term,
          surface: text.slice(start, keepSuffix ? end - keepSuffix.length : end),
          token: '',
          kind: 'player',
          keepSuffix,
        });
        pos = fEnd;
        matched = true;
        break;
      }
      if (!matched) pos++;
    }
    return out;
  }

  function mask(input: string, shared?: Record<string, string>): MaskResult {
    const text = neutraliseTokens(input.normalize('NFC'));
    const hits: MaskHit[] = [];
    // A shared restore map keeps tokens consistent across several fields of one payload.
    const restore: Record<string, string> = shared ?? {};
    const restoreKeyBySurface = new Map<string, string>();
    let ambiguousCount = 0;
    let extraCount = 0;
    for (const [tok, surface] of Object.entries(restore)) {
      const m = /^\[(A|X)(\d+)\]$/.exec(tok);
      if (!m) continue;
      const n = Number(m[2]);
      if (m[1] === 'A') ambiguousCount = Math.max(ambiguousCount, n);
      else extraCount = Math.max(extraCount, n);
      restoreKeyBySurface.set(`${m[1]}:${surface}`, `${m[1]}${n}`);
    }

    // Emails and phone numbers win over names inside them, so "ollie.smith@..." is hidden whole.
    const contacts = findContacts(text);
    const spans: Span[] = [];
    for (const s of findSpans(text)) {
      if (contacts.some((c) => s.start < c.end && s.end > c.start)) continue;
      let token: string;
      let kind: MaskHit['kind'];
      if (s.term.tokens.size === 1) {
        token = [...s.term.tokens][0];
        kind = 'player';
      } else {
        const key = `${s.term.tokens.size > 1 ? 'A' : 'X'}:${s.surface}`;
        let existing = restoreKeyBySurface.get(key);
        if (!existing) {
          existing = s.term.tokens.size > 1 ? `A${++ambiguousCount}` : `X${++extraCount}`;
          restoreKeyBySurface.set(key, existing);
          restore[`[${existing}]`] = s.surface;
        }
        token = existing;
        kind = s.term.tokens.size > 1 ? 'ambiguous' : 'extra';
      }
      spans.push({ ...s, token, kind });
      hits.push({ token, surface: s.surface, kind });
    }

    for (const c of contacts) {
      const token = `X${++extraCount}`;
      restore[`[${token}]`] = c.surface;
      spans.push({ start: c.start, end: c.end, token, kind: c.kind });
      hits.push({ token, surface: c.surface, kind: c.kind });
    }

    spans.sort((a, b) => a.start - b.start);
    let out = '';
    let pos = 0;
    for (const s of spans) {
      if (s.start < pos) continue;
      out += text.slice(pos, s.start) + `[${s.token}]` + (s.keepSuffix ?? '');
      pos = s.end;
    }
    out += text.slice(pos);
    return { text: out, hits, restore };
  }

  function unmask(text: string, restore: Record<string, string> = {}): string {
    return text.replace(
      /\[\s*([Pp]\d{2,3}|[Aa]\d+|[Xx]\d+)\s*\]|(?<![\p{L}\p{N}_[#])(P\d{2,3})(?![\p{L}\p{N}_\]])/gu,
      (whole, bracketed: string | undefined, bare: string | undefined) => {
        const id = (bracketed ?? bare)!.toUpperCase();
        if (id.startsWith('P')) return nameByToken.get(id) ?? whole;
        return restore[`[${id}]`] ?? whole;
      },
    );
  }

  function findLeaks(text: string): string[] {
    const leaks = new Set<string>();
    const t = text.normalize('NFC');
    for (const s of findSpans(t)) leaks.add(s.surface);
    for (const c of findContacts(t)) leaks.add(c.surface);
    return [...leaks];
  }

  return { mask, unmask, findLeaks };
}

/** Thrown when a payload about to leave the device still contains a name. */
export class LeakError extends Error {
  constructor(public readonly leaks: string[]) {
    super(`Blocked: ${leaks.length} name(s) or hidden word(s) were still in the text.`);
    this.name = 'LeakError';
  }
}

/** Throws LeakError if `payload` contains any squad name or hidden word. */
export function assertNoLeaks(masker: Masker, payload: string): void {
  const leaks = masker.findLeaks(payload);
  if (leaks.length) throw new LeakError(leaks);
}

/** Masks every string (values and object keys) inside a JSON-compatible object. */
export function maskDeep<T>(masker: Masker, value: T, restore: Record<string, string> = {}): T {
  if (typeof value === 'string') {
    return masker.mask(value, restore).text as T;
  }
  if (Array.isArray(value)) return value.map((v) => maskDeep(masker, v, restore)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[masker.mask(k, restore).text] = maskDeep(masker, v, restore);
    return out as T;
  }
  return value;
}

/** Unmasks every string (values and object keys) inside a JSON-compatible object. */
export function unmaskDeep<T>(masker: Masker, value: T, restore: Record<string, string> = {}): T {
  if (typeof value === 'string') return masker.unmask(value, restore) as T;
  if (Array.isArray(value)) return value.map((v) => unmaskDeep(masker, v, restore)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[masker.unmask(k, restore)] = unmaskDeep(masker, v, restore);
    return out as T;
  }
  return value;
}
