import type { ExamPartKind } from "../../types";
import type { StudentExamAnswer, StudentExamAnswerPatch } from "../types";

/**
 * Pending answers against the server-acknowledged ones. Pure functions over plain data, so the same
 * model is persisted, recovered and tested without a browser.
 *
 * - `saved` holds only acknowledged answers; a draft is a local edit with the acknowledged value it
 *   was based on (`baseline`) and a local edit sequence.
 * - A command is immutable once built: its key, expected version and payload are sent unchanged on
 *   every retry. An acknowledgment clears only the drafts it covered (same sequence); typing during
 *   the save stays pending.
 * - After a conflict or recovery, a draft is rebased only when the server still holds its baseline.
 *   A newer distinct server value becomes a field conflict for the student to resolve.
 */

export const MAX_PATCH = 300;

export type Answer = StudentExamAnswer;
export type Draft = { value: Answer; baseline: Answer; seq: number };
export type Command = {
  key: string;
  generation: number;
  expectedVersion: number;
  answers: StudentExamAnswerPatch[];
  /** The draft sequence each answer was taken from. */
  seqs: Record<string, number>;
};
export type Drafts = {
  saved: Record<string, Answer>;
  version: number;
  drafts: Record<string, Draft>;
  inflight: Command | null;
  /** Questions whose acknowledged value changed elsewhere since the draft: the server value. */
  conflicts: Record<string, Answer>;
  seq: number;
};

export const EMPTY: Answer = { choiceId: null, text: null };

/** The stored form: blank or whitespace-only text is no answer (the database stores '' as null). */
export function normalize(answer: Answer | undefined): Answer {
  if (!answer) return EMPTY;
  return { choiceId: answer.choiceId ?? null, text: answer.text !== null && answer.text.trim() !== "" ? answer.text : null };
}

export function sameAnswer(a: Answer | undefined, b: Answer | undefined) {
  const x = normalize(a);
  const y = normalize(b);
  return x.choiceId === y.choiceId && x.text === y.text;
}

export function isAnswered(answer: Answer | undefined) {
  const value = normalize(answer);
  return value.choiceId !== null || value.text !== null;
}

export function createDrafts(saved: Record<string, Answer>, version: number): Drafts {
  return { saved: { ...saved }, version, drafts: {}, inflight: null, conflicts: {}, seq: 0 };
}

/** What the student sees: their pending edit, else the acknowledged answer. */
export function current(model: Drafts, questionId: string): Answer {
  return model.drafts[questionId]?.value ?? model.saved[questionId] ?? EMPTY;
}

/** Exactly what the student typed or chose (a leading space is still an edit in progress). */
function sameRaw(a: Answer | undefined, b: Answer | undefined) {
  return (a?.choiceId ?? null) === (b?.choiceId ?? null) && (a?.text ?? "") === (b?.text ?? "");
}

export function edit(model: Drafts, questionId: string, value: Answer): Drafts {
  const seq = model.seq + 1;
  const drafts = { ...model.drafts };
  const inFlight = model.inflight?.answers.some((answer) => answer.questionId === questionId) ?? false;
  // Back to the acknowledged value with nothing in flight or in conflict: nothing left to save.
  if (!inFlight && !(questionId in model.conflicts) && sameRaw(value, model.saved[questionId])) {
    delete drafts[questionId];
    return { ...model, drafts, seq };
  }
  drafts[questionId] = { value, baseline: drafts[questionId]?.baseline ?? normalize(model.saved[questionId]), seq };
  return { ...model, drafts, seq };
}

/**
 * The next immutable command: pending drafts in exam order, at most 300, skipping conflicts and
 * questions that can no longer be answered. Null when there is nothing to send or a command is
 * already in flight.
 */
export function nextCommand(
  model: Drafts, order: readonly { id: string; kind: ExamPartKind }[], answerable: (questionId: string) => boolean, key: string, generation: number,
): { model: Drafts; command: Command } | null {
  if (model.inflight) return null;
  const answers: StudentExamAnswerPatch[] = [];
  const seqs: Record<string, number> = {};
  for (const question of order) {
    const draft = model.drafts[question.id];
    if (!draft || question.id in model.conflicts || !answerable(question.id)) continue;
    const value = normalize(draft.value);
    answers.push(question.kind === "written_work" ? { questionId: question.id, text: value.text } : { questionId: question.id, choiceId: value.choiceId });
    seqs[question.id] = draft.seq;
    if (answers.length === MAX_PATCH) break;
  }
  if (answers.length === 0) return null;
  const command: Command = { key, generation, expectedVersion: model.version, answers, seqs };
  return { model: { ...model, inflight: command }, command };
}

function patchValue(answer: StudentExamAnswerPatch): Answer {
  return normalize("text" in answer ? { choiceId: null, text: answer.text } : { choiceId: answer.choiceId, text: null });
}

/** The in-flight command was accepted at `version`. */
export function acknowledge(model: Drafts, version: number): Drafts {
  const command = model.inflight;
  if (!command) return { ...model, version: Math.max(model.version, version) };
  const saved = { ...model.saved };
  const drafts = { ...model.drafts };
  for (const answer of command.answers) {
    const value = patchValue(answer);
    saved[answer.questionId] = value;
    const draft = drafts[answer.questionId];
    if (!draft) continue;
    if (draft.seq === command.seqs[answer.questionId] || sameRaw(draft.value, value)) delete drafts[answer.questionId];
    // A later edit is now based on what the server just acknowledged.
    else drafts[answer.questionId] = { ...draft, baseline: value };
  }
  return { ...model, saved, drafts, version, inflight: null };
}

/** The in-flight command was definitively not accepted; its drafts stay pending. */
export function reject(model: Drafts): Drafts {
  return { ...model, inflight: null };
}

/**
 * Applies fresh server answers. Drafts based on a value the server still holds are kept (rebased);
 * drafts the server already matches are cleared; anything else becomes a field conflict. Only call
 * with no command in flight.
 */
export function reconcile(model: Drafts, server: Record<string, Answer>, version: number): Drafts {
  const drafts: Record<string, Draft> = {};
  const conflicts: Record<string, Answer> = {};
  for (const [questionId, draft] of Object.entries(model.drafts)) {
    const value = server[questionId] ?? EMPTY;
    if (sameAnswer(value, draft.value)) continue;
    if (sameAnswer(value, draft.baseline)) {
      drafts[questionId] = { ...draft, baseline: normalize(value) };
      continue;
    }
    drafts[questionId] = draft;
    conflicts[questionId] = normalize(value);
  }
  return { ...model, saved: { ...server }, version, drafts, conflicts, inflight: null };
}

/** Keep this device's answer (it will be saved over the newer one) or take the saved answer. */
export function resolve(model: Drafts, questionId: string, choice: "mine" | "saved"): Drafts {
  const server = model.conflicts[questionId];
  if (!server) return model;
  const conflicts = { ...model.conflicts };
  delete conflicts[questionId];
  const drafts = { ...model.drafts };
  if (choice === "saved" || !drafts[questionId]) delete drafts[questionId];
  else drafts[questionId] = { ...drafts[questionId], baseline: server };
  return { ...model, drafts, conflicts };
}

/** Stops pending writes to questions that can no longer be answered (exclusions). */
export function drop(model: Drafts, questionIds: Iterable<string>): Drafts {
  const drafts = { ...model.drafts };
  const conflicts = { ...model.conflicts };
  let changed = false;
  for (const questionId of questionIds) {
    if (questionId in drafts || questionId in conflicts) changed = true;
    delete drafts[questionId];
    delete conflicts[questionId];
  }
  return changed ? { ...model, drafts, conflicts } : model;
}

export function pendingCount(model: Drafts) {
  return Object.keys(model.drafts).length;
}
