import "server-only";

import { z } from "zod";

import { cookieAuthority, type Db } from "@/lib/supabase/authority";
import { studentFailure, studentFailureFromDatabase } from "./errors";
import {
  toStudentExamClaim, toStudentExamDeparture, toStudentExamEntry, toStudentExamHeartbeat, toStudentExamOverview, toStudentExamPage,
  toStudentExamRead, toStudentExamRelease, toStudentExamReview, toStudentExamSave, toStudentExamSubmit,
} from "./mapper";
import {
  STUDENT_EXAM_PAGE_SIZE, type StudentExamAnswerPatch, type StudentExamClaimOutcome, type StudentExamCommandResult,
  type StudentExamDepartureOutcome, type StudentExamEntry, type StudentExamHeartbeatOutcome, type StudentExamOverview,
  type StudentExamPage, type StudentExamRead, type StudentExamReadOutcome, type StudentExamReleaseOutcome, type StudentExamReview,
  type StudentExamSaveOutcome, type StudentExamSubmitOutcome,
} from "./types";

/**
 * Student exam operations for the cookie web boundary. Each call runs as the signed-in account; the
 * database resolves the connected annual record of the academy's open year and re-checks academy,
 * year, suspension, audience, window and standalone access. The academy id only locates the exam.
 * Responses are per-account and never shared-cached.
 */

type DatabaseError = { code?: string; message?: string; details?: string };

async function call<T>(
  run: (db: Db) => PromiseLike<{ data: unknown; error: DatabaseError | null }>, parse: (value: unknown) => T,
): Promise<StudentExamRead<T>> {
  const caller = await cookieAuthority();
  if (!caller) return studentFailure("forbidden");
  try {
    const { data, error } = await run(caller.db);
    if (error) return studentFailureFromDatabase(error);
    return { ok: true, data: parse(data) };
  } catch {
    return studentFailure("unavailable");
  }
}

const listInput = z.object({ academyId: z.uuid(), page: z.number().int().min(1).max(10_000) });

/** One page of the caller's discoverable exams in the academy: resumable and open first, then upcoming, then history. */
export async function listMyExams(input: { academyId: string; page: number }): Promise<StudentExamRead<StudentExamPage>> {
  const parsed = listInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, page } = parsed.data;
  return call((db) => db.rpc("list_my_exams", {
    p_academy_id: academyId, p_limit: STUDENT_EXAM_PAGE_SIZE, p_offset: (page - 1) * STUDENT_EXAM_PAGE_SIZE,
  }), toStudentExamPage);
}

const examInput = z.object({ academyId: z.uuid(), examId: z.uuid() });

/**
 * The caller's overview of one exam of the academy. It may settle due work through the existing
 * settlement path; it never starts an attempt or moves a deadline. Undiscoverable, wrong-academy and
 * unknown exams are not_found.
 */
export async function getMyExamOverview(input: { academyId: string; examId: string }): Promise<StudentExamRead<StudentExamOverview>> {
  const parsed = examInput.safeParse(input);
  if (!parsed.success) return studentFailure("not_found");
  const { academyId, examId } = parsed.data;
  return call((db) => db.rpc("get_my_exam_overview", { p_academy_id: academyId, p_exam_id: examId }), toStudentExamOverview);
}

/**
 * The caller's read-only review of their accepted work and the released solutions (EDRA-235). It
 * settles due work like the overview and never starts, claims or resets anything. Before solutions
 * qualify the database returns a status reason only; no editor token is involved.
 */
export async function getMyExamReview(input: { academyId: string; examId: string }): Promise<StudentExamRead<StudentExamReview>> {
  const parsed = examInput.safeParse(input);
  if (!parsed.success) return studentFailure("not_found");
  const { academyId, examId } = parsed.data;
  return call((db) => db.rpc("get_my_exam_review", { p_academy_id: academyId, p_exam_id: examId }), toStudentExamReview);
}

async function command<T extends object>(
  run: (db: Db) => PromiseLike<{ data: unknown; error: DatabaseError | null }>, parse: (value: unknown) => T,
): Promise<StudentExamCommandResult<T>> {
  const result = await call(run, parse);
  return result.ok ? { ok: true, ...result.data } : result;
}

const token = z.string().regex(/^[0-9a-f]{64}$/);
const entryInput = examInput.extend({ token: token.nullable() });
const editorInput = examInput.extend({ token });
const version = z.number().int().min(0).max(2_147_483_647);
const patch = z.union([
  z.object({ questionId: z.uuid(), choiceId: z.uuid().nullable() }).strict(),
  z.object({ questionId: z.uuid(), text: z.string().max(10_000).nullable() }).strict(),
]);
const generation = z.number().int().positive();
const saveInput = editorInput.extend({
  generation,
  expectedVersion: version,
  key: z.uuid(),
  answers: z.array(patch).min(1).max(300)
    .refine((answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length),
});
const submitInput = editorInput.extend({ generation, expectedVersion: version, key: z.uuid() });
const departureInput = editorInput.extend({ generation, eventId: z.uuid(), questionId: z.uuid().nullable() });

/**
 * Starts the caller's single attempt or resumes it, and claims the answering editor in the same
 * transaction. Repeats return the same attempt with its original start, deadline and departure
 * count. Another live editor yields a busy claim without question material; there is no takeover.
 * A recovery token is the document's current claim, presented again after a refresh.
 */
export async function enterMyExam(input: { academyId: string; examId: string; token: string | null }): Promise<StudentExamCommandResult<StudentExamEntry>> {
  const parsed = entryInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: recovery } = parsed.data;
  return command((db) => db.rpc("enter_my_exam", { p_academy_id: academyId, p_exam_id: examId, p_token: recovery as string }), toStudentExamEntry);
}

/** Reclaims the editor after the lease expired (fresh generation), or reports busy while another editor is live. */
export async function claimMyExamEditor(input: { academyId: string; examId: string; token: string | null }): Promise<StudentExamCommandResult<StudentExamClaimOutcome>> {
  const parsed = entryInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current } = parsed.data;
  return command((db) => db.rpc("claim_my_exam_editor", { p_academy_id: academyId, p_exam_id: examId, p_token: current as string }), toStudentExamClaim);
}

/** Heartbeat: renews the current editor's lease and returns live attempt metadata and exclusions. */
export async function renewMyExamEditor(input: { academyId: string; examId: string; token: string }): Promise<StudentExamCommandResult<StudentExamHeartbeatOutcome>> {
  const parsed = editorInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current } = parsed.data;
  return command((db) => db.rpc("renew_my_exam_editor", { p_academy_id: academyId, p_exam_id: examId, p_token: current }), toStudentExamHeartbeat);
}

/** Ends the current editor's lease (best effort). History is untouched. */
export async function releaseMyExamEditor(input: { academyId: string; examId: string; token: string }): Promise<StudentExamCommandResult<StudentExamReleaseOutcome>> {
  const parsed = editorInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current } = parsed.data;
  return command((db) => db.rpc("release_my_exam_editor", { p_academy_id: academyId, p_exam_id: examId, p_token: current }), toStudentExamRelease);
}

/** The answering document (questions, own saved answers) for the current editor of an active attempt only. */
export async function getMyExamAnswering(input: { academyId: string; examId: string; token: string }): Promise<StudentExamCommandResult<StudentExamReadOutcome>> {
  const parsed = editorInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current } = parsed.data;
  return command((db) => db.rpc("get_my_exam_answering", { p_academy_id: academyId, p_exam_id: examId, p_token: current }), toStudentExamRead);
}

/**
 * Saves a patch of 1..300 distinct questions against the acknowledged answers version. The command
 * key makes retries exact: a repeat replays the accepted outcome and never writes twice.
 */
export async function saveMyExamAnswers(input: {
  academyId: string; examId: string; token: string; generation: number; expectedVersion: number; key: string; answers: StudentExamAnswerPatch[];
}): Promise<StudentExamCommandResult<StudentExamSaveOutcome>> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current, expectedVersion, key, answers, generation } = parsed.data;
  const payload = answers.map((answer) => "text" in answer
    ? { question_id: answer.questionId, text_answer: answer.text }
    : { question_id: answer.questionId, choice_id: answer.choiceId });
  return command((db) => db.rpc("save_my_exam_answers", {
    p_academy_id: academyId, p_exam_id: examId, p_token: current, p_generation: generation, p_expected_version: expectedVersion, p_answers: payload, p_key: key,
  }), toStudentExamSave);
}

/** Final submission of the saved answers at the acknowledged version; retries with the same key replay. */
export async function submitMyExam(input: {
  academyId: string; examId: string; token: string; generation: number; expectedVersion: number; key: string;
}): Promise<StudentExamCommandResult<StudentExamSubmitOutcome>> {
  const parsed = submitInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current, expectedVersion, key, generation } = parsed.data;
  return command((db) => db.rpc("submit_my_exam", {
    p_academy_id: academyId, p_exam_id: examId, p_token: current, p_generation: generation, p_expected_version: expectedVersion, p_key: key,
  }), toStudentExamSubmit);
}

/** Records one logical departure (EDRA-234 detects them); a repeated event id is counted once. */
export async function recordMyExamDeparture(input: {
  academyId: string; examId: string; token: string; generation: number; eventId: string; questionId: string | null;
}): Promise<StudentExamCommandResult<StudentExamDepartureOutcome>> {
  const parsed = departureInput.safeParse(input);
  if (!parsed.success) return studentFailure("validation");
  const { academyId, examId, token: current, eventId, questionId, generation } = parsed.data;
  return command((db) => db.rpc("record_my_exam_departure", {
    p_academy_id: academyId, p_exam_id: examId, p_token: current, p_generation: generation, p_event_id: eventId,
    // PostgreSQL UUID parameters accept null; generated RPC argument types cannot express this.
    p_question_id: questionId as string,
  }), toStudentExamDeparture);
}
