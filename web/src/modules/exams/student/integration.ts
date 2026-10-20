import type { ComponentType } from "react";

import type { StudentExamAttemptState, StudentExamDepartureOutcome, StudentExamEditor } from "./types";

/**
 * Entry integration point for the timed exam. The overview's Start/Resume control stays disabled
 * until both slices register here:
 *
 * - EDRA-234 supplies fullscreen capability and acquisition. `enterFullscreen` is called directly from
 *   the click, before any network request, and resolves false when refused or cancelled; no attempt
 *   is started then. `exitFullscreen` runs when entry fails after fullscreen succeeded and when the
 *   session hands control back to the overview. Departure detection begins only once `Answering`
 *   mounts for an acknowledged attempt and reports its lifecycle.
 * - EDRA-233 supplies `Answering` (`StudentExamAnswering`): the single active editor for the
 *   acknowledged attempt and claim. It loads question material itself through the fenced read, owns
 *   autosave, recovery, pending answers, question images and submission.
 *
 * `onFinished` returns control to the overview, which reloads its server state.
 */
export type ExamAnsweringProps = {
  academyId: string;
  examId: string;
  attempt: StudentExamAttemptState;
  /** The editor claim acknowledged by entry; the session renews and, if needed, reclaims it. */
  editor: StudentExamEditor;
  onFinished: () => void;
  /** EDRA-234: receives the lifecycle once the attempt is loaded, and null when the session ends. */
  onLifecycle?: (lifecycle: ExamAnsweringLifecycle | null) => void;
};

/**
 * What the departure integration (EDRA-234) needs from the answering session. It detects one logical
 * departure and calls `recordDeparture`, which stores the event, delivers it with the editor claim
 * (retrying the same event id, after a refresh too) and applies the server outcome: warned and
 * duplicate move to the returned next question, kicked and finalized end the session. Delivery does
 * not wait for pending saves; the third departure submits what the server already saved.
 */
export type ExamAnsweringLifecycle = {
  attemptId: string;
  currentQuestionId: () => string | null;
  recordDeparture: (eventId?: string) => Promise<StudentExamDepartureOutcome | null>;
  /** Pauses answer editing (for example behind Return to fullscreen); null resumes. The timer continues. */
  setEditBlock: (reason: string | null) => void;
  getState: () => ExamAnsweringLifecycleState;
  subscribe: (listener: () => void) => () => void;
};

export type ExamAnsweringLifecycleState = { finished: boolean; departureCount: number; pendingDeparture: boolean; editBlock: string | null };

export type ExamEntryIntegration = {
  fullscreenSupported: () => boolean;
  enterFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<void>;
  Answering: ComponentType<ExamAnsweringProps>;
};

/**
 * Null until EDRA-234 is integrated: real students cannot start a timer before fullscreen entry and
 * departure detection exist. EDRA-233's `StudentExamAnswering` is ready to be registered here.
 */
export const examEntryIntegration: ExamEntryIntegration | null = null;
