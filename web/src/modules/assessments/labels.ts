"use server";

import { z } from "zod";

import { labelFailure, runLabelCommand, type LabelFailure } from "@/modules/labels/server";
import { ASSESSMENT_TYPES } from "./types";

const input = z.object({
  academyId: z.guid(), type: z.enum(ASSESSMENT_TYPES), assessmentId: z.guid(), labelId: z.guid(), applied: z.boolean(),
});

/**
 * Applies or removes one label on one assignment, quiz or exam: the desired state, so a retry repeats
 * harmlessly and other labels are never replaced. Any active staff member, including on archived
 * assessments and in closed years; the assessment itself is not changed or versioned.
 */
export async function setAssessmentLabel(value: unknown): Promise<{ ok: true; labelIds: string[] } | LabelFailure> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return labelFailure("validation");
  const { academyId, type, assessmentId, labelId, applied } = parsed.data;
  return runLabelCommand(
    (db) => db.rpc("set_assessment_label", { p_academy_id: academyId, p_type: type, p_assessment_id: assessmentId, p_label_id: labelId, p_applied: applied }),
    (data) => ({ ok: true as const, labelIds: z.array(z.string()).parse(data) }),
  );
}
