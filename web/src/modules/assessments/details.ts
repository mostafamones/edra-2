import { academyDateTime, academyInstant } from "@/lib/academy-time";
import type { AcademyRole } from "@/modules/academies/roles";
import { assignmentPermissions, assignmentsRootKey, loadAssignment, saveAssignment, type Assignment, type AssignmentDraft } from "@/modules/assignments";
import { examPermissions, examsRootKey, loadExam, saveExam, type Exam, type ExamDraft } from "@/modules/exams";
import { quizPermissions, quizzesRootKey, loadQuiz, saveQuiz, type Quiz, type QuizDraft } from "@/modules/quizzes";
import type { AssessmentType } from "./types";

export type AssessmentDetails =
  | { type: "assignment"; value: Assignment }
  | { type: "quiz"; value: Quiz }
  | { type: "exam"; value: Exam };

export type QuickValues = {
  title: string;
  audience: "" | "level" | "program" | "groups";
  levelId: string;
  trackId: string;
  groupIds: string[];
  parts: { id: string; title: string }[];
  dueAt: string;
  timeLimit: string;
};

/** The owning module's query root, refreshed after any change to its assessment. */
export const typeRootKey = (academyId: string, type: AssessmentType) =>
  type === "assignment" ? assignmentsRootKey(academyId) : type === "quiz" ? quizzesRootKey(academyId) : examsRootKey(academyId);

export function localDate(iso: string | null): string {
  if (!iso) return "";
  const value = academyDateTime(iso);
  return `${value.date}T${value.time}`;
}

/** Keep untouched instants exact, including seconds and the repeated daylight-saving hour. */
export function savedInstant(value: string, original: string | null): string | null {
  if (value === localDate(original)) return original;
  const [date, time] = value.split("T");
  return value ? academyInstant(date, time ?? "") : null;
}

export function quickValues(record: AssessmentDetails): QuickValues {
  const value = record.value;
  return {
    title: value.title, audience: value.audience ?? "", levelId: value.levelId ?? "", trackId: value.trackId ?? "", groupIds: [...value.groupIds],
    parts: value.parts.map((part) => ({ id: part.id, title: part.title })),
    dueAt: record.type === "assignment" ? localDate(record.value.dueAt) : "",
    timeLimit: record.type === "assignment" || record.value.timeLimitMinutes === null ? "" : String(record.value.timeLimitMinutes),
  };
}

export function detailsPermissions(role: AcademyRole, record: AssessmentDetails) {
  if (record.type === "assignment") {
    const permissions = assignmentPermissions(role, record.value);
    return { edit: permissions.edit, audience: permissions.editStructure, parts: permissions.edit, timer: false, availability: false, mark: permissions.mark };
  }
  const permissions = record.type === "quiz" ? quizPermissions(role, record.value) : examPermissions(role, record.value);
  return { edit: permissions.edit, audience: permissions.editTarget, parts: permissions.editStructure, timer: permissions.editTarget, availability: permissions.availability, mark: permissions.mark && record.value.ready };
}

export function quickErrors(record: AssessmentDetails, values: QuickValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.title.trim() || values.title.trim().length > 200) errors.title = "Enter a name of 1–200 characters.";
  values.parts.forEach((part, index) => {
    if (!part.title.trim() || part.title.trim().length > 200) errors[`parts.${index}.title`] = "Enter a part name of 1–200 characters.";
  });
  if (values.audience === "" && record.type === "assignment") errors.audience = "Choose an audience.";
  if ((values.audience === "level" || values.audience === "program") && !values.levelId) errors.levelId = "Choose a level.";
  if (values.audience === "program" && !values.trackId) errors.trackId = "Choose a track.";
  if (values.audience === "groups" && values.groupIds.length === 0) errors.groupIds = "Choose at least one group.";
  if (record.type === "assignment") {
    if (values.dueAt && !savedInstant(values.dueAt, record.value.dueAt)) errors.dueAt = "Enter a valid date and time.";
  } else if (values.timeLimit !== "" && (!Number.isInteger(Number(values.timeLimit)) || Number(values.timeLimit) < 1 || Number(values.timeLimit) > 600)) {
    errors.timeLimit = "Enter whole minutes from 1 to 600, or clear the timer.";
  }
  return errors;
}

function audienceDraft(values: QuickValues) {
  const audience: QuizDraft["audience"] = values.audience === "" ? null : values.audience === "groups" ? "groups" : values.trackId ? "program" : "level";
  return {
    audience,
    levelId: audience === "level" || audience === "program" ? values.levelId || null : null,
    trackId: audience === "program" ? values.trackId || null : null,
    groupIds: audience === "groups" ? values.groupIds : [],
  };
}

/** Only the fields exposed by quick edit change; all questions, keys and instructions retain their stored values. */
export function assignmentDetailsDraft(value: Assignment, values: QuickValues): AssignmentDraft {
  const titles = new Map(values.parts.map((part) => [part.id, part.title.trim()]));
  const target = audienceDraft(values);
  return {
    title: values.title.trim(), instructions: value.instructions, ...target, audience: target.audience ?? value.audience,
    dueAt: savedInstant(values.dueAt, value.dueAt),
    parts: value.parts.map((part) => ({
      id: part.id, title: titles.get(part.id) ?? part.title, instructions: part.instructions, kind: part.kind,
      maxScore: part.authoredMaxScore ?? part.maxScore,
      questions: part.questions.map((question) => ({
        id: question.id, prompt: question.prompt, maxScore: question.maxScore,
        choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label, isCorrect: choice.isCorrect })),
      })),
    })),
  };
}

export function timedDetailsDraft(value: Quiz | Exam, values: QuickValues): QuizDraft & ExamDraft {
  const titles = new Map(values.parts.map((part) => [part.id, part.title.trim()]));
  return {
    title: values.title.trim(), instructions: value.instructions, solutionNotes: value.solutionNotes, ...audienceDraft(values),
    timeLimitMinutes: values.timeLimit === "" ? null : Number(values.timeLimit),
    parts: value.parts.map((part) => ({
      id: part.id, title: titles.get(part.id) ?? part.title, instructions: part.instructions, kind: part.kind,
      questions: part.questions.map((question) => ({
        id: question.id, prompt: question.prompt, modelAnswer: question.modelAnswer, maxScore: question.maxScore,
        choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label, isCorrect: choice.isCorrect })),
      })),
    })),
  };
}

export async function loadDetails(academyId: string, type: AssessmentType, id: string): Promise<AssessmentDetails> {
  const record = type === "assignment" ? await loadAssignment(academyId, id) : type === "quiz" ? await loadQuiz(academyId, id) : await loadExam(academyId, id);
  if (!record) throw new Error("This assessment is no longer available.");
  return { type, value: record } as AssessmentDetails;
}

export type DetailsResult = { ok: true; record: AssessmentDetails } | { ok: false; code: string; message: string };

export async function saveDetails(record: AssessmentDetails, values: QuickValues, availability?: { opensAt: string | null; closesAt: string | null }): Promise<DetailsResult> {
  const { academyId, id, version: expectedVersion } = record.value;
  if (record.type === "assignment") {
    const result = await saveAssignment({ academyId, assignmentId: id, expectedVersion, draft: assignmentDetailsDraft(record.value, values) });
    return result.ok ? { ok: true, record: { type: "assignment", value: result.assignment } } : result;
  }
  if (record.type === "quiz") {
    const result = await saveQuiz({ academyId, quizId: id, expectedVersion, draft: timedDetailsDraft(record.value, values), ...(availability ? { availability } : {}) });
    return result.ok ? { ok: true, record: { type: "quiz", value: result.quiz } } : result;
  }
  const result = await saveExam({ academyId, examId: id, expectedVersion, draft: timedDetailsDraft(record.value, values), ...(availability ? { availability } : {}) });
  return result.ok ? { ok: true, record: { type: "exam", value: result.exam } } : result;
}
