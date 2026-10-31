"use server";

import { z } from "zod";

import { labelFailure } from "./errors";
import { runLabelCommand } from "./server";
import { LABEL_DOMAINS, type DeleteLabelResult, type LabelResult } from "./types";
import { labelColorSchema, labelNameSchema, toLabel } from "./validation";

/** Label definition commands (Owner, Head Admin and Admin; enforced by the database). */

const definition = z.object({ academyId: z.guid(), labelId: z.guid(), name: labelNameSchema, color: labelColorSchema });

/** `labelId` is chosen by the caller, so a retried create returns the label it already made. */
export async function createLabel(value: unknown): Promise<LabelResult> {
  const parsed = definition.extend({ domain: z.enum(LABEL_DOMAINS) }).safeParse(value);
  if (!parsed.success) return labelFailure("validation");
  const { academyId, labelId, name, color, domain } = parsed.data;
  return runLabelCommand((db) => db.rpc("create_label", { p_academy_id: academyId, p_label_id: labelId, p_name: name, p_color: color, p_domain: domain }),
    (data) => ({ ok: true as const, label: toLabel(data) }));
}

/** Sets the name and color; every use, including archived and closed-year ones, shows the change. */
export async function updateLabel(value: unknown): Promise<LabelResult> {
  const parsed = definition.safeParse(value);
  if (!parsed.success) return labelFailure("validation");
  const { academyId, labelId, name, color } = parsed.data;
  return runLabelCommand((db) => db.rpc("update_label", { p_academy_id: academyId, p_label_id: labelId, p_name: name, p_color: color }),
    (data) => ({ ok: true as const, label: toLabel(data) }));
}

const deleteResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("deleted") }),
  z.object({ status: z.literal("confirm"), uses: z.number().int().positive() }),
]);

/**
 * Deletes an unused label at once. A used one is deleted only with `confirmed`; otherwise nothing
 * changes and the current use count comes back. The database counts at deletion time.
 */
export async function deleteLabel(value: unknown): Promise<DeleteLabelResult> {
  const parsed = z.object({ academyId: z.guid(), labelId: z.guid(), confirmed: z.boolean() }).safeParse(value);
  if (!parsed.success) return labelFailure("validation");
  const { academyId, labelId, confirmed } = parsed.data;
  return runLabelCommand((db) => db.rpc("delete_label", { p_academy_id: academyId, p_label_id: labelId, p_confirmed: confirmed }), (data) => {
    const result = deleteResult.parse(data);
    return result.status === "deleted" ? { ok: true as const, deleted: true as const } : { ok: true as const, deleted: false as const, uses: result.uses };
  });
}
