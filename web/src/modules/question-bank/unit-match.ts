import type { BankUnit } from "./bank-contract";
import { topicKey } from "./topics";

const filler = new Set(["and", "the", "in", "of", "to", "unit", "lesson", "chapter", "و", "في", "من", "الوحدة"]);
const normalized = (value: string) => topicKey(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (value: string) => new Set(normalized(value).split(" ").filter(word => word && !filler.has(word)));

/** Suggestions come only from the confirmed academic scope, and ties never preselect a unit. */
export function suggestUnit(topic: string | null, units: BankUnit[]) {
  if (!topic) return undefined;
  const normalizedTopic = normalized(topic);
  const exact = units.filter(unit => normalized(unit.title) === normalizedTopic);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const topicWords = words(topic);
  if (topicWords.size < 2) return undefined;
  const matches = units.filter(unit => [unit.title, ...unit.labels].some(label => {
    const labelWords = words(label);
    return [...topicWords].every(word => labelWords.has(word)) && labelWords.size <= topicWords.size + 1;
  }));
  return matches.length === 1 ? matches[0] : undefined;
}
