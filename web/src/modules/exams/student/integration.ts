import type { ComponentType } from "react";

import type { StudentExamAttempt } from "./types";

/**
 * Entry integration point for the timed exam (EDRA-232 handoff). The overview's Start/Resume control
 * stays disabled until both downstream slices register here:
 *
 * - EDRA-234 supplies fullscreen capability and acquisition. `enterFullscreen` is called directly from
 *   the click, before any network request, and resolves false when refused or cancelled; no attempt
 *   is started then. `exitFullscreen` runs when the start request fails after fullscreen succeeded.
 *   Departure detection begins only once `Answering` mounts for an acknowledged attempt.
 * - EDRA-233 supplies `Answering`: the single active editor for the acknowledged attempt, rendered in
 *   the fullscreen surface. It owns editor ownership, recovery, pending answers and submission, and
 *   loads question material itself; this slice never forwards questions to the browser.
 *
 * `onFinished` returns control to the overview, which reloads its server state.
 */
export type ExamAnsweringProps = {
  academyId: string;
  examId: string;
  attempt: StudentExamAttempt;
  onFinished: () => void;
};

export type ExamEntryIntegration = {
  fullscreenSupported: () => boolean;
  enterFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<void>;
  Answering: ComponentType<ExamAnsweringProps>;
};

/** Null until EDRA-233 and EDRA-234 are integrated: real students cannot start a timer before then. */
export const examEntryIntegration: ExamEntryIntegration | null = null;
