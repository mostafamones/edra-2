import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { ASSIGNMENT_STATES, PART_KINDS } from "@/modules/assignments";
import { EXAM_PART_KINDS, EXAM_PHASES } from "@/modules/exams";
import { QUIZ_PART_KINDS, QUIZ_PHASES } from "@/modules/quizzes";
import { ALL, type AssessmentListParams } from "./params";
import { ASSESSMENT_TYPES, type AssessmentPage } from "./types";

/** Staff read in the browser. The RPC checks academy membership, like the per-type lists. */

export const assessmentsRootKey = (academyId: string) => ["assessments", academyId] as const;
export const assessmentListQueryKey = (academyId: string, filters: ListFilters, page: number) =>
  [...assessmentsRootKey(academyId), "list", filters, page] as const;

/** URL state plus the academy's active year (or `all` when no year is open). */
export type ListFilters = Omit<AssessmentListParams, "page"> & { year: string };

const common = {
  id: z.string(), title: z.string(), academic_year_id: z.string(), audience: z.enum(["level", "program", "groups"]).nullable(),
  level_id: z.string().nullable(), track_id: z.string().nullable(), group_ids: z.array(z.string()),
  max_score: z.string(), marked_count: z.number().int(), audience_count: z.number().int(), created_at: z.string(), due_at: z.string().nullable(), opens_at: z.string().nullable(), closes_at: z.string().nullable(),
  processing_pending: z.boolean(),
};
const parts = <K extends z.ZodType>(kind: K) => z.array(z.object({ title: z.string(), kind }));
const pageSchema = z.object({
  total: z.number().int(),
  items: z.array(z.discriminatedUnion("type", [
    z.object({ ...common, type: z.literal("assignment"), status: z.enum(ASSIGNMENT_STATES), parts: parts(z.enum(PART_KINDS).nullable()) }),
    z.object({ ...common, type: z.literal("quiz"), status: z.enum(QUIZ_PHASES), parts: parts(z.enum(QUIZ_PART_KINDS)) }),
    z.object({ ...common, type: z.literal("exam"), status: z.enum(EXAM_PHASES), parts: parts(z.enum(EXAM_PART_KINDS)) }),
  ])),
});

/** Maps the RPC result; an unknown status or type fails the whole page rather than showing a partial list. */
export function toAssessmentPage(value: unknown): AssessmentPage {
  const page = pageSchema.parse(value);
  return {
    total: page.total,
    items: page.items.map((row) => {
      const base = {
        id: row.id, title: row.title, academicYearId: row.academic_year_id, audience: row.audience, levelId: row.level_id,
        trackId: row.track_id, groupIds: row.group_ids, maxScore: row.max_score, markedCount: row.marked_count, audienceCount: row.audience_count,
        createdAt: row.created_at,
      };
      return row.type === "assignment"
        ? { ...base, type: row.type, status: row.status, dueAt: row.due_at, parts: row.parts }
        : row.type === "quiz"
          ? { ...base, type: row.type, status: row.status, opensAt: row.opens_at, closesAt: row.closes_at, processingPending: row.processing_pending, parts: row.parts }
          : { ...base, type: row.type, status: row.status, opensAt: row.opens_at, closesAt: row.closes_at, processingPending: row.processing_pending, parts: row.parts };
    }),
  };
}

/** One page of the academy's assignments, quizzes and exams in a single database order. */
export async function loadAssessments(academyId: string, filters: ListFilters, page: number): Promise<AssessmentPage> {
  const { data, error } = await createClient().rpc("list_assessments", {
    p_academy_id: academyId,
    p_academic_year_id: (filters.year === ALL ? null : filters.year) as string,
    p_types: filters.type === ALL ? [...ASSESSMENT_TYPES] : [filters.type],
    p_search: filters.search.trim(),
    p_audience: (filters.audience === ALL ? null : filters.audience) as string,
    p_level_id: filters.level as string,
    p_track_id: filters.track as string,
    p_group_id: filters.groupId as string,
    p_statuses: filters.statuses,
    p_sort: filters.sort,
    p_group: filters.group,
    p_limit: filters.pageSize,
    p_offset: page * filters.pageSize,
  });
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("forbidden");
  return toAssessmentPage(data);
}
