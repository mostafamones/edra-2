import type { MarkedChoices } from "./marked-choices";

export type SourcePage = {
  number: number;
  text: string;
  mode: "text" | "scan";
  image?: Blob;
  blankImage?: boolean;
  lineTops?: (number | null)[];
  preferImage?: boolean;
  markedChoices?: MarkedChoices[];
  error?: string;
};

export type SourceCrop = { top: number; bottom: number };
export type SourceRegion = { page: number; crop?: SourceCrop };

export type Question = {
  id: string;
  section: string | null;
  topic?: string | null;
  number: string;
  page: number;
  prompt: string;
  choices: { key: string; text: string }[];
  crop?: SourceCrop;
  continuations?: SourceRegion[];
  answer?: { key: string; page: number; source?: "book"; marked?: true };
  modelAnswer?: string;
  issues: string[];
};

export type PageIssue = { source: "Book" | "Answer key"; page: number; reason: string; retryable: boolean };

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const digits = (s: string) => s.replace(/[٠-٩۰-۹]/g, c => String(Math.max(arabicDigits.indexOf(c), persianDigits.indexOf(c))));
const choices: Record<string, string> = { أ: "A", ا: "A", ب: "B", ج: "C", د: "D" };
export const choiceKey = (s: string) => Object.hasOwn(choices, s) ? choices[s] : s.toUpperCase();
const explicit = /^(?:q(?:uestion)?|(?:ال)?سؤال|س)\s*(\d{1,3})(?:\s*[.):\-–،]\s*|\s*$)(.*)$/i;
const numbered = /^(\d{1,3})\s*(?:\.(?!\d)|[)\-:–،])\s*(.*)$/;
const numericRange = /^\d+\s*[-–—−]\s*\d/;
const responseLine = /\s*(?:[.·…_](?:\s*[.·…_]){3,})\s*$/u;
const visualReference = /\b(?:histogram|(?:following|given|above|below)\s+(?:\w+\s+){0,4}(?:table|graph|diagram|figure|chart)|(?:table|graph|diagram|figure|chart)\s+(?:above|below))\b|(?:الجدول|الرسم البياني|الشكل)\s+(?:التالي|الموضح|المقابل)/iu;
const choiceMarker = /(?:^|\s)(?:\(([A-Da-dأابجد])\)|([A-Da-dأابجد])\s*[.)\-:])\s*/g;
const writtenPart = /^(?:(?:find|calculate|evaluate|determine|show|prove|explain|justify|describe|draw|complete|compute|solve|write|state|compare|sketch|give)\b|(?:أوجد|اوجد|احسب|أحسب|أثبت|اثبت|برهن|اشرح|وضح|علل|ارسم|أكمل|اكمل|استنتج|قارن|احسبوا)(?:\s|$))/iu;
const partMarks = /\(\s*\d+(?:[.,]\d+)?\s*(?:marks?|points?|درج(?:ة|ات))\s*\)/iu;
const answerEntry = /(?:^|[\s;,،|])(?:q\s*|س\s*)?(\d{1,3})\s*[.\-:):–،]\s*\(?([A-Dأابجد])\)?(?=$|[\s;,،|])/gi;
const keyHeading = /^(?:answer key|مفتاح الإجابات|مفتاح الاجابات)\s*:?$/iu;
const workedExample = /^(?:(?:\d{1,3}\s*[.):\-–،]\s*)?(?:worked example|مثال محلول))(?:\s|[:.\-–]|$)/iu;
const aliases: [RegExp, string][] = [
  [/^(?:solid geometry|3d geometry|الهندسة الفراغية)$/i, "Solid geometry"],
  [/^(?:algebra|الجبر)$/i, "Algebra"],
  [/^(?:calculus|التفاضل والتكامل|التفاضل و التكامل)$/i, "Calculus"],
  [/^(?:geometry|الهندسة)$/i, "Geometry"],
  [/^(?:reading(?: comprehension)?|فهم المقروء|القراءة)$/i, "Reading comprehension"],
];

function sectionName(line: string) {
  const s = line.trim().replace(/\s*[:–—-]\s*$/, "");
  const named = /^(?:chapter|unit|topic|section|الوحدة|الفصل|الباب)\s+(\d{1,3})(?:\s*[:–—.-]\s*([^\n]{1,58}))?$/i.exec(digits(s));
  if (named?.[2]) return aliases.find(([pattern]) => pattern.test(named[2]))?.[1] ?? named[2].trim().toLowerCase();
  if (named) return `Section ${Number(named[1])}`;
  return aliases.find(([pattern]) => pattern.test(s))?.[1] ?? null;
}

function classifyChoices(q: Question) {
  const source = q.prompt;
  // Bare labels are only candidates at the start of a line. An inline formula
  // or sentence containing "A -" must not cut off the rest of the stem.
  const hits = [...source.matchAll(choiceMarker)].filter(hit => {
    const label = hit[0].trimStart();
    const start = hit.index + hit[0].length - label.length;
    return !source.slice(source.lastIndexOf("\n", start - 1) + 1, start).trim()
      || (hit[1] !== undefined && hit[1] === hit[1].toUpperCase());
  });
  if (!hits.length) return;
  const stem = source.slice(0, hits[0].index).trim();
  const options = hits.map((hit, index) => ({
    key: choiceKey(hit[1] ?? hit[2]),
    text: source.slice(hit.index + hit[0].length, hits[index + 1]?.index).trim(),
  }));
  const ordered = options.length >= 2 && options.every((option, i) => option.key === "ABCD"[i] && option.text);
  const written = options.some(option => partMarks.test(digits(option.text)))
    || options.filter(option => writtenPart.test(option.text)).length >= 2;
  if (!stem || !ordered || written) {
    addIssue(q, written || options.length === 1 ? "Check the written subparts against the source" : "Check the possible choices against the source");
    return;
  }
  q.prompt = stem;
  q.choices = options;
}

type KeyEntry = { key: string; page: number };
const keyOf = (section: string | null, number: string) => JSON.stringify([
  section ? (sectionName(section) ?? section).toLowerCase() : null,
  digits(number).replace(/^0+(?=\d)/, ""),
]);
const addIssue = (q: Question, reason: string) => { if (!q.issues.includes(reason)) q.issues.push(reason); };

export function parseImport(book: SourcePage[], key: SourcePage[] = [], extracted?: { questions: Question[]; issues: PageIssue[] }, partial = false) {
  const questions: Question[] = extracted?.questions.map(q => ({ ...q, issues: [...q.issues] })) ?? [];
  const issues: PageIssue[] = [...(extracted?.issues ?? [])];
  const keys = new Map<string, KeyEntry[]>();
  const seen = new Map<string, Question[]>();
  const sections = new Set<string>();
  for (const q of questions) if (q.section) sections.add(q.section);
  const embeddedPages = book.filter(page => page.mode !== "scan" && !page.error && keyHeading.test(page.text.split(/\r?\n/).find(line => line.trim())?.trim() ?? ""));
  // A page range cannot establish that restarted numbering elsewhere in a book is unambiguous.
  const keyPages = partial ? [] : key.length ? key : embeddedPages;
  let section: string | null = null;
  for (const page of keyPages) {
    if (!key.length) section = null; // separately identified key pages may not be adjacent
    if (page.error) { issues.push({ source: "Answer key", page: page.number, reason: page.error, retryable: !!page.image }); section = null; continue; }
    let count = 0;
    for (const line of page.text.split(/\r?\n/)) {
      const heading = sectionName(line);
      if (heading) { section = heading; continue; }
      for (const hit of digits(line).matchAll(answerEntry)) {
        // Inline explanations are common in a combined book. Accept only rows
        // that consist entirely of answer entries in an explicitly labelled key.
        if (!key.length && !/^[\s;,،|]*$/.test(digits(line).replace(answerEntry, ""))) break;
        count++;
        const number = String(Number(hit[1])), mapKey = keyOf(section, number);
        const found = keys.get(mapKey) ?? [];
        found.push({ key: choiceKey(hit[2]), page: page.number });
        keys.set(mapKey, found);
      }
    }
    if (!count) issues.push({ source: key.length ? "Answer key" : "Book", page: page.number, reason: "No answer entries detected", retryable: !!page.image });
  }

  section = null;
  let previous: Question | undefined;
  let previousPage = 0;
  for (const page of extracted ? [] : book) {
    if (embeddedPages.includes(page)) { previous = undefined; continue; }
    if (page.mode === "scan" && !page.error) {
      issues.push({ source: "Book", page: page.number, reason: "Scanned question page needs visual extraction", retryable: false });
      section = null;
      previous = undefined;
      continue;
    }
    if (page.error) {
      issues.push({ source: "Book", page: page.number, reason: page.error, retryable: !!page.image });
      section = null; // an unreadable page may have started another chapter
      previous = undefined;
      continue;
    }
    let current: Question | undefined;
    let count = 0, headings = 0, unassigned = false, mixedNumbering = false;
    let inWorkedExample = false;
    const lines = page.text.split(/\r?\n/);
    const explicitPage = lines.some(line => explicit.test(digits(line.trim())));
    const starts: { question: Question; top?: number | null }[] = [];
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim().replace(responseLine, "").trimEnd();
      if (!line || /^\d{1,3}$/.test(digits(line))) continue;
      const heading = sectionName(line);
      if (heading) { section = heading; sections.add(heading); current = undefined; inWorkedExample = false; headings++; continue; }
      const normalized = digits(line);
      if (workedExample.test(normalized)) { current = undefined; inWorkedExample = true; continue; }
      const bare = numericRange.test(normalized) ? null : numbered.exec(normalized);
      const match = explicit.exec(normalized) ?? (!explicitPage ? bare : null);
      // A sequential bare number could start a new question or a subpart.
      // Preserve the text and surface the ambiguity instead of inventing a split.
      if (!match && bare && current && Number(bare[1]) === Number(current.number) + 1 && /\p{L}/u.test(bare[2])) {
        mixedNumbering = true;
        addIssue(current, "Check whether this text contains another question");
      }
      if (match && Number(match[1]) > 0) {
        inWorkedExample = false;
        const number = String(Number(match[1]));
        current = { id: `${page.number}:${++count}`, section, number, page: page.number, prompt: "", choices: [], issues: [] };
        questions.push(current);
        starts.push({ question: current, top: page.lineTops?.[index] });
        if (match[2]) current.prompt = line.slice(line.length - match[2].length);
      } else if (inWorkedExample) {
        continue;
      } else if (current) {
        current.prompt = [current.prompt, line].filter(Boolean).join("\n");
      } else {
        unassigned = true;
      }
    }
    // Only crop a single, top-to-bottom sequence of explicit headings. Otherwise
    // keep the full page so a crop cannot silently discard a column or scan.
    if (explicitPage && starts.every(({ top }, index) =>
      typeof top === "number" && top >= 0 && top < 0.98 &&
      (index === 0 || top - (starts[index - 1].top ?? 1) > 0.025),
    )) {
      starts.forEach(({ question, top }, index) => {
        question.crop = { top: Math.max(0, top! - 0.006), bottom: Math.min(1, (starts[index + 1]?.top ?? 1) - (starts[index + 1] ? 0.007 : 0)) };
      });
    }
    const possibleContinuation: Question | undefined = unassigned && !headings && previousPage + 1 === page.number ? previous : undefined;
    if (possibleContinuation) {
      const bottom = starts[0]?.question.crop?.top;
      (possibleContinuation.continuations ??= []).push({ page: page.number, crop: bottom && bottom > 0.06 ? { top: 0, bottom } : undefined });
      addIssue(possibleContinuation, `Check the possible continuation on page ${page.number}`);
    }
    if (!count && !possibleContinuation && (!headings || unassigned)) issues.push({
      source: "Book", page: page.number,
      reason: headings && !unassigned ? "Only a section heading was readable" : "No numbered questions detected",
      retryable: !!page.image,
    });
    if (count && unassigned && !possibleContinuation) issues.push({ source: "Book", page: page.number, reason: "Text before the first question may be a passage or continuation", retryable: false });
    if (mixedNumbering) issues.push({ source: "Book", page: page.number, reason: "Mixed question numbering: check for a missed question", retryable: false });
    previous = current ?? possibleContinuation;
    previousPage = page.number;
  }

  for (const q of questions) {
    if (!extracted) classifyChoices(q);
    if (!q.prompt.trim()) addIssue(q, "Missing question text");
    if (visualReference.test(q.prompt)) addIssue(q, "Check the chart, table or figure against the source");
    if (!q.section && sections.size) addIssue(q, "Section not identified");
    if (q.id.startsWith("gemini:unnumbered:")) continue;
    const id = keyOf(q.section, q.number);
    const group = seen.get(id) ?? [];
    group.push(q);
    seen.set(id, group);
    if (q.choices.length && keyPages.length && (q.section || !sections.size)) {
      const matches = keys.get(id) ?? [];
      if (matches.length > 1) addIssue(q, "Multiple answers have this section and number");
      else if (!matches.length) { if (!q.answer) addIssue(q, q.section ? "No answer found in this section" : "No answer found for this question"); }
      else {
        const choice = q.choices.find(c => choiceKey(c.key) === matches[0].key);
        if (!choice) addIssue(q, "Answer key refers to a missing choice");
        else if (q.answer?.marked && q.answer.key !== choice.key) {
          q.answer = undefined;
          addIssue(q, "The marked choice and the answer key disagree");
        } else if (!q.answer?.marked) q.answer = { key: choice.key, page: matches[0].page, ...(key.length ? {} : { source: "book" }) };
      }
    }
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const q of group) {
      if (!q.answer?.marked) q.answer = undefined;
      addIssue(q, q.section ? "Question number is repeated in this section" : "Question number is repeated");
    }
  }
  return { questions, issues, sections: [...sections] };
}
