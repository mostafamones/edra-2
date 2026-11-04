export type ConcernErrorCode =
  | "validation" | "forbidden" | "conflict" | "concern_settled" | "message_not_found" | "message_deleted"
  | "edit_expired" | "reply_unavailable" | "invalid_mention" | "invalid_participant" | "unavailable";
export type ConcernFailure = { ok: false; code: ConcernErrorCode; message: string };

const MESSAGES: Record<ConcernErrorCode, string> = {
  validation: "Check the message and try again.",
  forbidden: "You no longer have access to this concern.",
  conflict: "This was already used for something else. Refresh and try again.",
  concern_settled: "This concern is settled.",
  message_not_found: "This message no longer exists.",
  message_deleted: "This message was deleted.",
  edit_expired: "Messages can only be edited within five minutes of sending.",
  reply_unavailable: "The message you replied to was deleted.",
  invalid_mention: "Someone you mentioned is no longer in this concern.",
  invalid_participant: "Someone you selected is no longer active staff.",
  unavailable: "Could not reach the server. Check your connection and try again.",
};

export const concernFailure = (code: ConcernErrorCode): ConcernFailure => ({ ok: false, code, message: MESSAGES[code] });

/** Commands raise P0001 with the code; the shared concern guard raises 42501/55000. Anything else is unavailable. */
export function concernFailureFromDatabase(error: { code?: string; message?: string }): ConcernFailure {
  if (error.code === "42501") return concernFailure("forbidden");
  if (error.code === "55000") return concernFailure("concern_settled");
  if (error.code === "23505") return concernFailure("conflict");
  if (error.code === "P0001" && error.message && error.message in MESSAGES) return concernFailure(error.message as ConcernErrorCode);
  return concernFailure("unavailable");
}
