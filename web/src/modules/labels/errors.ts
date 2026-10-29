import type { LabelErrorCode, LabelFailure } from "./types";

const MESSAGES: Record<LabelErrorCode, string> = {
  validation: "Check the label name and color and try again.",
  forbidden: "You don’t have permission to do this in this academy.",
  not_found: "This item no longer exists in this academy. Refresh and try again.",
  label_not_found: "This label was deleted. Refresh and try again.",
  duplicate_name: "A label with this name already exists.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

export const labelFailure = (code: LabelErrorCode): LabelFailure => ({ ok: false, code, message: MESSAGES[code] });

/** The label commands raise SQLSTATE P0001 with the code as the message; anything else is unavailable. */
export function labelFailureFromDatabase(error: { code?: string; message?: string }): LabelFailure {
  return error.code === "P0001" && error.message && error.message in MESSAGES ? labelFailure(error.message as LabelErrorCode) : labelFailure("unavailable");
}
