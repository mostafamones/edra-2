import { FullscreenExamAnswering } from "./components/fullscreen";
import { enterFullscreen, exitFullscreen, fullscreenSupported } from "./fullscreen";
import type { ExamDepartureMonitor } from "./departures/signals";
import type { DepartureContext } from "./departures/state";
import type { ComponentType } from "react";

import type { StudentExamAttemptState, StudentExamDepartureOutcome, StudentExamEditor } from "./types";

/** Fullscreen-first entry and the existing fenced answering surface, registered by EDRA-234.
 * Detection begins synchronously at the acknowledged attempt, including material loading.
 * Terminal handoff disarms detection before returning to the refreshed overview.
 */
export type ExamAnsweringProps = {
  departures?: ExamDepartureMonitor;
  academyId: string;
  examId: string;
  attempt: StudentExamAttemptState;
  /** The editor claim acknowledged by entry; the session renews and, if needed, reclaims it. */
  editor: StudentExamEditor;
  onFinished: () => void;
  /** EDRA-234: receives the lifecycle while material loads, and null when the session ends. */
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
  departureContext: () => DepartureContext;
  currentToken: () => string;
  recordDeparture: (eventId?: string, context?: DepartureContext) => Promise<StudentExamDepartureOutcome | null>;
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

/** Source integration is complete; hosted release prerequisites are recorded in the module README. */
export const examEntryIntegration: ExamEntryIntegration = { fullscreenSupported, enterFullscreen, exitFullscreen, Answering: FullscreenExamAnswering };
