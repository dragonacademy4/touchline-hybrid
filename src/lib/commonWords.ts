/**
 * First names that are also words a coach writes in lowercase all the time
 * ("mark your runner", "max effort", "he will need to"). For these, only a
 * capitalised occurrence is treated as a name: "Will scored" is hidden, "he
 * will need to" stays readable. Every other name is hidden in any case.
 *
 * Kept deliberately short: a name only goes here if hiding the lowercase word
 * would garble ordinary coaching notes. Entries are folded (lowercase, no accents).
 */
export const COMMON_WORD_NAMES: ReadonlySet<string> = new Set([
  // football verbs and phrases
  'will', 'mark', 'rob', 'nick', 'chip', 'max', 'rush', 'drew', 'win', 'kit', 'fox', 'judge',
  'buddy', 'pat', 'tad', 'just', 'chance', 'miles', 'major', 'lucky', 'rusty', 'true', 'young',
  'star', 'storm', 'penny', 'frank', 'guy',
  // bib colours, weather, months
  'blue', 'grey', 'gray', 'sunny', 'sky', 'summer', 'winter', 'autumn', 'april', 'may', 'june',
  'august', 'march',
  // feelings
  'grace', 'hope', 'joy', 'faith', 'patience', 'rose',
]);
