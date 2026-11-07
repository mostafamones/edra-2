export type ConcernErrorCode =
  | "validation" | "forbidden" | "conflict" | "concern_settled" | "message_not_found" | "message_deleted"
  | "edit_expired" | "reply_unavailable" | "invalid_mention" | "invalid_participant" | "not_permitted" | "stale"
  | "concern_not_found" | "attachment_unavailable" | "attachment_limit" | "attachment_too_large" | "unsupported_media" | "voice_too_long"
  | "unavailable";
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
  not_permitted: "Only an Owner, Head Admin or Admin can do this.",
  stale: "This concern changed. Review the latest state and try again.",
  concern_not_found: "No concern matches this ID.",
  attachment_unavailable: "This attachment is no longer available. Remove it and try again.",
  attachment_limit: "Too many attachments. Send or remove some first.",
  attachment_too_large: "Files can be up to 25 MB.",
  unsupported_media: "This voice note could not be checked. Record it again in this panel.",
  voice_too_long: "Voice notes can be up to 5 minutes.",
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
