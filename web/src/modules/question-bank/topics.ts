import type { Question } from "./parser";

/** Confirmed topics per question; `dismissed` hides the extraction suggestion without confirming anything. */
export type TopicEdit = { confirmed: string[]; dismissed?: boolean };
export type TopicEdits = Record<string, TopicEdit>;
export type TopicAssignment = { label: string; verification: "suggested" | "confirmed" };
export type TopicGroup = { key: string; label: string | null; questions: Question[]; pending: number };
export type TopicChange = { type: "confirm" | "remove"; label: string } | { type: "move"; from: string; to: string } | { type: "clear" };

export const maxTopics = 12;
export const unassignedTopic = "";
const genericSection = /^(?:section\s*\d+|(?:multiple[ -]choice|mcqs?|true[ /-]false|written|questions?|exercises?|practice|answer the following|اختر|أسئلة|تدريبات)(?:$|\b|\s))/iu;

export const cleanTopic = (label: string) => label.normalize("NFKC").trim().replace(/\s+/gu, " ");
export const topicKey = (label: string) => cleanTopic(label).replace(/[ؐ-ؚـً-ٰٟ]/gu, "").toLowerCase();

export function suggestedTopic(question: Question) {
  const label = question.topic === undefined ? question.section : question.topic;
  if (!label) return null;
  const clean = cleanTopic(label);
  return clean && !genericSection.test(clean) ? clean : null;
}

export function questionTopics(question: Question, edit?: TopicEdit): TopicAssignment[] {
  const topics: TopicAssignment[] = (edit?.confirmed ?? []).map(label => ({ label, verification: "confirmed" }));
  const suggestion = edit?.dismissed ? null : suggestedTopic(question);
  if (suggestion && !topics.some(topic => topicKey(topic.label) === topicKey(suggestion))) topics.push({ label: suggestion, verification: "suggested" });
  return topics;
}

export function changeTopics(question: Question, edit: TopicEdit | undefined, change: TopicChange): TopicEdit {
  let confirmed = edit?.confirmed ?? [];
  let dismissed = edit?.dismissed ?? false;
  const suggestion = suggestedTopic(question);
  const remove = (label: string) => {
    confirmed = confirmed.filter(item => topicKey(item) !== topicKey(label));
    if (suggestion && topicKey(suggestion) === topicKey(label)) dismissed = true;
  };
  const add = (label: string) => {
    const clean = cleanTopic(label);
    if (clean && !confirmed.some(item => topicKey(item) === topicKey(clean)) && confirmed.length < maxTopics) confirmed = [...confirmed, clean];
  };
  if (change.type === "confirm") add(change.label);
  else if (change.type === "remove") remove(change.label);
  else if (change.type === "move") { remove(change.from); add(change.to); }
  else { confirmed = []; dismissed = true; }
  return { confirmed, dismissed };
}

/** Each question appears under every topic it has; `primary` places it once, under its first topic. */
export function groupTopics(questions: Question[], edits: TopicEdits) {
  const groups = new Map<string, TopicGroup>();
  const primary = new Map<string, TopicGroup>();
  const assignments = new Map<string, TopicAssignment[]>();
  const place = (target: Map<string, TopicGroup>, question: Question, topic?: TopicAssignment) => {
    const key = topic ? topicKey(topic.label) : unassignedTopic;
    const group = target.get(key) ?? { key, label: topic?.label ?? null, questions: [], pending: 0 };
    group.questions.push(question);
    if (topic?.verification === "suggested") group.pending++;
    target.set(key, group);
  };
  for (const question of questions) {
    const topics = questionTopics(question, edits[question.id]);
    if (topics.length) assignments.set(question.id, topics);
    if (!topics.length) place(groups, question);
    for (const topic of topics) place(groups, question, topic);
    place(primary, question, topics[0]);
  }
  const sort = (list: Map<string, TopicGroup>) => [...list.values()].sort((a, b) => !a.label ? 1 : !b.label ? -1 : a.label.localeCompare(b.label));
  return { groups: sort(groups), primary: sort(primary), assignments };
}
