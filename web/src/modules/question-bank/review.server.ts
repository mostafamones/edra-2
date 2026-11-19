import "@tanstack/react-start/server-only";

import { academyMember } from "@/lib/supabase/membership";
import { isAcademyManager } from "@/modules/academies/roles";
import { GeminiReviewError, inspectQuestionPages, type ReviewFailure, type ReviewStage } from "./gemini";
import { pageReviewInput, type PageReview } from "./review-contract";
import type { ScanTranscription } from "./scan-contract";

export type ReviewResult = ({ ok: true; review: PageReview } | { ok: false; code: ReviewFailure | "denied" | "input"; stage?: ReviewStage }) & { transcription?: ScanTranscription };

export async function reviewPageOnServer(value: unknown): Promise<ReviewResult> {
  if (import.meta.env.PROD || process.env.NODE_ENV === "production") return { ok: false, code: "unavailable" };
  const parsed = pageReviewInput.safeParse(value);
  if (!parsed.success) return { ok: false, code: "input" };
  const { academyId, pages, knownTopics, previousPage, transcriptionOnly } = parsed.data;
  const actor = await academyMember(academyId);
  if (!actor || !isAcademyManager(actor.role)) return { ok: false, code: "denied" };
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, code: "unavailable" };
  let transcription: ScanTranscription | undefined;
  try {
    const scan = "transcription" in pages[0] || ("image" in pages[0] && pages[0].scan);
    const review = scan || previousPage ? await inspectQuestionPages(pages, key, undefined, knownTopics ?? [], false, value => { transcription = value; }, { previousPage, transcriptionOnly })
      : knownTopics?.length ? await inspectQuestionPages(pages, key, undefined, knownTopics) : await inspectQuestionPages(pages, key);
    return { ok: true, review, ...(transcription ? { transcription } : {}) };
  } catch (error) {
    return { ...(error instanceof GeminiReviewError ? { ok: false as const, code: error.code, ...(error.stage ? { stage: error.stage } : {}) } : { ok: false as const, code: "provider" as const }),
      ...(transcription ? { transcription } : {}),
    };
  }
}
