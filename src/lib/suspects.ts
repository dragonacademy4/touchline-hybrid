/**
 * Finds words in already-masked text that look like names of people who
 * aren't in the squad ("mum Sarah Jones", "told Mason well done"). The squad
 * masker can't know these, so the coach is asked before anything is sent,
 * with every suspect selected for hiding by default.
 *
 * A capitalised word is a suspect when:
 * - it's in the middle of a sentence ("told Mason well done"), or
 * - it starts a sentence but isn't a common English word ("Mason was great";
 *   "Great job" is fine), or
 * - it follows a family or title word ("mum Sarah", "Mrs Patel").
 * Neighbouring capitalised words stay together ("Sarah Jones"). Tokens such as
 * [P03], days, months and football vocabulary are ignored. False positives
 * only cost the coach a tap; a missed name is what we're trying to avoid.
 */
import { COMMON_ENGLISH } from './commonEnglish';

const IGNORE = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16', 'gk', 'cb', 'cm', 'st', 'lw', 'rw', 'lb', 'rb', 'cdm', 'cam',
  'rondo', 'rondos', 'warm-up', 'warmup', 'ssg', 'sssg', '1v1', '2v1', '2v2', '3v3', '4v4', '5v5', '7v7', '9v9', '11v11', 'fa', 'pe', 'ok', 'tbc',
  'i', "i'm", "i've", "i'll", "i'd", 'touchline', 'gemini', 'nano', 'chrome', 'xi',
]);

const FAMILY = /^(mum|mam|mom|mummy|mother|dad|daddy|father|nan|nana|nanny|gran|granny|grandma|grandad|grandpa|brother|sister|bro|sis|auntie|aunty|aunt|uncle|cousin|carer|guardian|stepmum|stepdad|mr|mrs|ms|miss|mx|dr|coach|teacher|sir)$/i;

const WORD_RE = /[\p{L}][\p{L}\p{M}'’-]*/gu;

function isCapitalised(w: string): boolean {
  const c = w[0];
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

function base(w: string): string {
  return w.replace(/['’]s$/i, '').replace(/['’-]+$/, '');
}

/** Returns suspect names (unique, in order of appearance) found in `text`. */
export function findSuspectNames(text: string, alsoIgnore: Iterable<string> = []): string[] {
  const ignore = new Set([...IGNORE, ...[...alsoIgnore].map((w) => w.toLowerCase())]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const words = [...line.matchAll(WORD_RE)].map((m) => ({ w: base(m[0]), start: m.index!, end: m.index! + m[0].length }));
    for (let i = 0; i < words.length; i++) {
      const { w, start } = words[i];
      if (w.length < 2 || !isCapitalised(w)) continue;
      const lower = w.toLowerCase();
      if (ignore.has(lower) || FAMILY.test(w)) continue;
      // Token remnants like the P in "[P03]" are single letters and already skipped.
      const before = line.slice(i === 0 ? 0 : words[i - 1].end, start);
      const sentenceStart = i === 0 ? !/\p{L}/u.test(line.slice(0, start)) : /[.!?:;|"“(]\s*$/.test(before);
      const afterFamily = i > 0 && FAMILY.test(words[i - 1].w) && /^\s+$/.test(before);
      const allCaps = w === w.toUpperCase();
      if (!afterFamily) {
        if (sentenceStart && COMMON_ENGLISH.has(lower)) continue;
        if (allCaps && COMMON_ENGLISH.has(lower)) continue; // shouting: "GREAT game"
      }
      let name = w;
      while (i + 1 < words.length && isCapitalised(words[i + 1].w) && /^\s+$/.test(line.slice(words[i].end, words[i + 1].start)) && !ignore.has(words[i + 1].w.toLowerCase())) {
        i++;
        name += ' ' + words[i].w;
      }
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
  }
  return out;
}
