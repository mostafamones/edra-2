import "@tanstack/react-start/server-only";

import { z } from "zod";

import { labelFailure, runLabelCommand, type LabelFailure } from "@/modules/labels/server";
import { MAX_LABEL_TARGETS } from "./label-limits";

const input = z.object({
  academyId: z.guid(),
  recordIds: z.array(z.guid()).min(1).max(MAX_LABEL_TARGETS).transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]),
  labelId: z.guid(),
  applied: z.boolean(),
});

/**
 * Applies or removes one label on explicit annual records: the desired state, so a retry repeats
 * harmlessly and other labels are never replaced. All-or-nothing across the records. Any active staff
 * member, including on archived and closed-year records; the records themselves do not change.
 */
export async function setStudentRecordsLabel(value: unknown): Promise<{ ok: true; changed: number } | LabelFailure> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return labelFailure("validation");
  const { academyId, recordIds, labelId, applied } = parsed.data;
  return runLabelCommand(
    (db) => db.rpc("set_student_records_label", { p_academy_id: academyId, p_record_ids: recordIds, p_label_id: labelId, p_applied: applied }),
    (data) => ({ ok: true as const, changed: z.number().int().parse(data) }),
  );
}
