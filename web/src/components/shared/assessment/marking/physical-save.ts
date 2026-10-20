import { newUuid } from "@/lib/uuid";
import { BLANK } from "./draft";
import type { SaveOutcome, SavePayload } from "./types";

type Work = { version: number; physicalDraft: { version: number } | null; submission: { source: string } | null };
type Result<S> = { ok: false; message: string; code: string } | { ok: true; outcome: string; student: S };
type Commands<S extends Work> = {
  initial: S;
  choiceIds: Set<string>;
  current: () => boolean;
  draft: (version: number, answers: { questionId: string; choiceId: string | null }[], key: string) => Promise<Result<S>>;
  confirm: (version: number, key: string) => Promise<Result<S>>;
  marks: (version: number, marks: { questionId: string; score: string | null }[], feedback: string | undefined, key: string) => Promise<Result<S>>;
  acknowledged: (student: S) => void;
  done: (student: S, payload: SavePayload) => SaveOutcome;
};

/** One immutable physical-save request. Each acknowledged stage is retained across retries. */
export function physicalSave<S extends Work>(payload: SavePayload, commands: Commands<S>): () => Promise<SaveOutcome> {
  let student = commands.initial;
  let drafted = false;
  let confirmed = student.submission !== null;
  const draftKey = newUuid(); const confirmKey = newUuid(); const marksKey = newUuid();
  const marks = payload.answers.filter((edit) => !commands.choiceIds.has(edit.questionId)).map((edit) => ({ questionId: edit.questionId, score: edit.value === "" ? null : edit.value }));
  const answers = [...commands.choiceIds].filter((id) => (payload.values[id] ?? "") !== "").map((id) => ({ questionId: id, choiceId: payload.values[id] === BLANK ? null : payload.values[id] }));
  const accept = (result: Result<S>): SaveOutcome | null => {
    if (!commands.current()) return { ok: true, saved: false };
    if (!result.ok) return { ok: false, message: result.message, uncertain: result.code === "unavailable" };
    student = result.student;
    commands.acknowledged(student);
    if (result.outcome === "conflict" || result.outcome === "source_conflict") return { ok: true, saved: false, message: result.outcome === "source_conflict" ? "Online work was accepted first. The physical entry remains history; review the accepted work." : "This work changed elsewhere. Review the latest saved values before saving again." };
    return null;
  };
  return async () => {
    if (!confirmed) {
      if (!drafted && payload.answers.some((edit) => commands.choiceIds.has(edit.questionId))) {
        const failure = accept(await commands.draft(student.physicalDraft?.version ?? 0, answers, draftKey));
        if (failure) return failure;
        drafted = true;
      }
      const failure = accept(await commands.confirm(student.physicalDraft?.version ?? 0, confirmKey));
      if (failure) return failure;
      confirmed = true;
    }
    if (marks.length || payload.feedback !== undefined) {
      const failure = accept(await commands.marks(student.version, marks, payload.feedback, marksKey));
      if (failure) return failure;
    }
    return commands.done(student, payload);
  };
}
