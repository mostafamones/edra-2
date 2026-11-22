import type { PageRange } from "./import-limits";
import type { Question } from "./parser";

export type SectionRef = { name: string; firstPage: number; continues: boolean };
const sectionKey = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

/**
 * Source sections are consecutive runs of the same printed heading. A heading that returns after a
 * different one starts a new section, so repeated headings stay distinct by their starting page. Only
 * the first run of a later page range may continue a section saved from the preceding range.
 */
export function sectionRuns(questions: Question[], range?: PageRange) {
  const refs = new Map<string, SectionRef>();
  let run: SectionRef & { key: string } | undefined;
  let first = true;
  for (const question of questions) {
    const name = question.section?.trim().slice(0, 150);
    if (!name) continue;
    const key = sectionKey(name);
    if (run?.key !== key) {
      run = { key, name, firstPage: question.page, continues: first && !!range && range.first > 1 && question.page === range.first };
      first = false;
    }
    refs.set(question.id, { name: run.name, firstPage: run.firstPage, continues: run.continues });
  }
  return refs;
}
