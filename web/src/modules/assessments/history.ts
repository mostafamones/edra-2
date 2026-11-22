import "@tanstack/react-start/server-only";

import { z } from "zod";

import type { Db } from "@/lib/supabase/authority";
import { formatScore, toHundredths } from "@/lib/score";

export const HISTORY_KINDS = ["assignment", "quiz", "exam"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

const score = z.union([z.string(), z.number()]).transform(String);
const schema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string(), title: z.string(), kind: z.enum(HISTORY_KINDS), createdAt: z.string(), work: z.string().nullable(),
    complete: z.boolean(), score: score.nullable(), maximum: score.nullable(), publicationState: z.string().nullable(),
    publication: z.object({ total: score, max_score: score.nullish(), published_at: z.string() }).nullable(),
  })),
});
type Item = z.infer<typeof schema>["items"][number];

/**
 * Where a student's work stands. An announced publication always wins, even while private changes await
 * correction; without one, missing or unmarked work never reads as a result.
 */
export function assessmentStatus(item: Pick<Item, "kind" | "work" | "complete" | "publication" | "publicationState">) {
  if (item.publication) return item.publicationState === "pending_correction" ? "correction_pending" : "announced";
  if (item.kind === "assignment" && item.work === "excused") return "excused";
  if (item.complete) return "unannounced";
  if (item.kind === "assignment" && item.work === "missing") return "missing";
  if (item.work === "expected" || item.work === "in_progress") return "awaiting_submission";
  return "marking_incomplete";
}

/** Score ÷ maximum as a percentage with one decimal, exact on decimal marks; null without a positive maximum. */
export function percentage(total: string, maximum: string | null | undefined): string | null {
  const value = toHundredths(total);
  const max = maximum == null ? null : toHundredths(maximum);
  if (value === null || !max) return null;
  const tenths = Math.round(value * 1000 / max);
  return `${Math.trunc(tenths / 10)}${tenths % 10 ? `.${tenths % 10}` : ""}`;
}

export type HistoryResult =
  | { ok: true; data: ReturnType<typeof present> }
  | { ok: false; code: "forbidden" | "not_found" | "validation" | "unavailable" };

const present = (data: z.infer<typeof schema>) => ({
  total: data.total,
  items: data.items.map(item => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    createdAt: item.createdAt,
    status: assessmentStatus(item),
    // The official result is the announced snapshot only: its own total and maximum, never the current draft.
    result: item.publication && {
      score: formatScore(item.publication.total),
      maximum: item.publication.max_score == null ? null : formatScore(item.publication.max_score),
      percentage: percentage(item.publication.total, item.publication.max_score),
      announcedAt: item.publication.published_at,
    },
    marking: { complete: item.complete, score: item.score === null ? null : formatScore(item.score), maximum: item.maximum === null ? null : formatScore(item.maximum) },
  })),
});

/** One annual record's assessments, newest first; `kind` filters before paging and `total` counts the filtered set. */
export async function studentAssessmentHistory(
  db: Db, academyId: string, recordId: string, kind: HistoryKind | null, limit: number, offset: number,
): Promise<HistoryResult> {
  const args = { p_academy_id: academyId, p_record_id: recordId, p_limit: limit, p_offset: offset, ...(kind ? { p_kind: kind } : {}) };
  const { data, error } = await db.rpc("staff_student_assessment_history", args);
  if (error) {
    const code = error.message === "forbidden" || error.message === "not_found" || error.message === "validation" ? error.message : "unavailable";
    return { ok: false, code };
  }
  const parsed = schema.safeParse(data);
  return parsed.success ? { ok: true, data: present(parsed.data) } : { ok: false, code: "unavailable" };
}
