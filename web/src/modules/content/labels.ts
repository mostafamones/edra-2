"use server";

import { z } from "zod";

import { labelFailure, runLabelCommand, type LabelFailure } from "@/modules/labels/server";

const input = z.object({ academyId: z.guid(), unitId: z.guid(), labelId: z.guid(), applied: z.boolean() });

/**
 * Applies or removes one label on one unit: the desired state, so a retry repeats harmlessly and other
 * labels are never replaced. Any active staff member, including on archived units and in closed years;
 * the unit itself is not changed or versioned.
 */
export async function setUnitLabel(value: unknown): Promise<{ ok: true; labelIds: string[] } | LabelFailure> {
  const parsed = input.safeParse(value);
  if (!parsed.success) return labelFailure("validation");
  const { academyId, unitId, labelId, applied } = parsed.data;
  return runLabelCommand(
    (db) => db.rpc("set_content_unit_label", { p_academy_id: academyId, p_unit_id: unitId, p_label_id: labelId, p_applied: applied }),
    (data) => ({ ok: true as const, labelIds: z.array(z.string()).parse(data) }),
  );
}
