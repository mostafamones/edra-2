/** Small, read-only search projections shared by the domain search services. */
export type SearchRecord = { id: string; title: string; detail: string; path: string };
export function literalSearch(query: string) { return `%${query.replace(/[\\%_]/g, value => `\\${value}`)}%`; }

/** Accent-insensitive matching for local command lists, including Arabic names. */
function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase();
}
export function matchesSearch(text: string, query: string) {
  return normalize(query).trim().split(/\s+/).every(word => normalize(text).includes(word));
}

/** One mistyped letter is allowed for words, never for grade numbers or short abbreviations. */
function nearWord(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Local picker ranking: exact phrase, word prefixes, substrings, then minor spelling errors. */
export function searchScore(text: string, query: string): number | null {
  const value = normalize(text), term = normalize(query).trim();
  if (!term) return 0;
  const words = value.split(/[^\p{L}\p{N}+#]+/u).filter(Boolean);
  let score = 0;
  for (const part of term.split(/\s+/)) {
    if (words.includes(part)) score += 40;
    else if (words.some(word => word.startsWith(part))) score += 30;
    else if (value.includes(part)) score += 20;
    else if (part.length >= 4 && /^\p{L}+$/u.test(part) && words.some(word => nearWord(word, part))) score += 5;
    else return null;
  }
  return score + (value === term ? 200 : value.startsWith(term) ? 100 : 0);
}
