import type { Question } from "./parser";

export type TopicEdits = Record<string, string | null>;
export type TopicAssignment = { label: string; verification: "suggested" | "confirmed" };
export type TopicGroup = { key: string; label: string | null; questions: Question[]; pending: number };

export const unassignedTopic = "";
const genericSection = /^(?:section\s*\d+|(?:multiple[ -]choice|mcqs?|true[ /-]false|written|questions?|exercises?|practice|answer the following|اختر|أسئلة|تدريبات)(?:$|\b|\s))/iu;

export const cleanTopic = (label: string) => label.normalize("NFKC").trim().replace(/\s+/gu, " ");
export const topicKey = (label: string) => cleanTopic(label).replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670]/gu, "").toLowerCase();

export function suggestedTopic(question: Question) {
  const label = question.topic === undefined ? question.section : question.topic;
  if (!label) return null;
  const clean = cleanTopic(label);
  return clean && !genericSection.test(clean) ? clean : null;
}

export function groupTopics(questions: Question[], edits: TopicEdits) {
  const groups = new Map<string, TopicGroup>();
  const assignments = new Map<string, TopicAssignment>();
  for (const question of questions) {
    const confirmed = Object.hasOwn(edits, question.id);
    const label = confirmed ? edits[question.id] : suggestedTopic(question);
    const key = label ? topicKey(label) : unassignedTopic;
    const group = groups.get(key) ?? { key, label, questions: [], pending: 0 };
    group.questions.push(question);
    if (label && !confirmed) group.pending++;
    groups.set(key, group);
    if (group.label) assignments.set(question.id, { label: group.label, verification: confirmed ? "confirmed" : "suggested" });
  }
  return {
    groups: [...groups.values()].sort((a, b) => !a.label ? 1 : !b.label ? -1 : a.label.localeCompare(b.label)),
    assignments,
  };
}
