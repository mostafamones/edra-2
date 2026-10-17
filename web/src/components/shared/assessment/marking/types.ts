import type { ReactNode } from "react";

/**
 * What the marking sheet needs to know about an assessment's parts and a student's work, whatever the
 * type. Each module maps its own types onto these.
 */
export type MarkChoice = { id: string; position: number; isCorrect: boolean };

export type MarkQuestion = {
  id: string;
  /** The number shown beside the question. */
  position: number;
  /** Shown as a hint on the number. */
  prompt?: string;
  /** Exact decimal string. */
  maxScore: string;
  choices: MarkChoice[];
  /** Cannot be changed here: excluded, or already part of accepted work. */
  locked?: boolean;
  /** Shown beneath the question: the written answer, the model answer. */
  note?: ReactNode;
  /** Kept for the record but not scored: it is locked and counts for nothing. */
  excluded?: boolean;
};

/**
 * `choice`: a letter per question, scored from the key. `manual`: a mark per question. `total`: a
 * legacy part that only takes a part total.
 */
export type MarkPart = {
  id: string;
  position: number;
  title: string;
  maxScore: string;
  entry: "choice" | "manual" | "total";
  questions: MarkQuestion[];
};

/** A mark typed for a whole part (fast marking), or an excused adjustment. */
export type FastMark = { partId: string; kind: "mark" | "excused"; score: string; reason: string | null; fromAnswers: boolean };

/** One question changed: a choice id, `BLANK`, a mark as typed, or "" to clear. */
export type AnswerEdit = { questionId: string; value: string };

/** One part's typed mark changed; `score` null clears it. */
export type MarkEdit = { partId: string; score: string | null; excusedReason?: string };

export type SavePayload = {
  /** Every question's value as entered, for types that send the whole sheet. */
  values: Record<string, string>;
  answers: AnswerEdit[];
  marks: MarkEdit[];
  /** Present only when the feedback changed. */
  feedback?: string;
};

/** `saved` is false when the server reported a conflict: the form keeps its place and reloads. */
export type SaveOutcome = { ok: false; message: string } | { ok: true; saved: boolean };
