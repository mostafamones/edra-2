import { z } from "zod";

import { invokeAccountFunction, type FunctionResult, type PasswordFailure } from "./client";

export type ContactPurpose = "login_phone" | "parent_phone";

const operationSchema = z.object({
  id: z.uuid(),
  purpose: z.enum(["login_phone", "parent_phone"]),
  stage: z.enum(["old", "new", "verified"]),
  newPhone: z.string(),
  recipientLast4: z.string(),
  codeSent: z.boolean(),
  expiresAt: z.string().nullable(),
  retryAt: z.string().nullable(),
});
export type ContactOperation = z.infer<typeof operationSchema>;

const contactsSchema = z.object({
  loginPhone: z.string().nullable(),
  parentPhone: z.string().nullable(),
  operations: z.array(operationSchema),
});
export type AccountContacts = z.infer<typeof contactsSchema>;

const operationResponse = z.object({ operation: operationSchema, sendError: z.string().optional() });
const completedResponse = z.object({ completed: z.literal(true) });

/** Validates the function's payload so an unexpected shape is a failure, never a partial state. */
async function call<T>(schema: z.ZodType<T>, body: Record<string, string>): Promise<FunctionResult<T>> {
  const result = await invokeAccountFunction<unknown>("account-contact", body);
  if (!result.ok) return result;
  const parsed = schema.safeParse(result.value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "unavailable" };
}

export const fetchContacts = () => call(contactsSchema, { action: "status" });

export const startContactChange = (purpose: ContactPurpose, phone: string) =>
  call(operationResponse, { action: "start", purpose, phone });

export const resendContactCode = (operationId: string) => call(operationResponse, { action: "resend", operationId });

/** Old stage → the operation moves to the new stage; new stage → completed (or a commit failure). */
export const verifyContactCode = (operationId: string, code: string) =>
  call(z.union([completedResponse, operationResponse]), { action: "verify", operationId, code });

export const completeContactChange = (operationId: string) => call(completedResponse, { action: "complete", operationId });

export const cancelContactChange = (operationId: string) => call(z.object({ canceled: z.literal(true) }), { action: "cancel", operationId });

const MESSAGES: Record<string, string> = {
  invalid_phone: "Enter a valid Egyptian mobile number",
  same_phone: "This is already your current number.",
  phone_taken: "This number is already used by another account.",
  parent_phone: "Your login phone can’t be your parent’s phone.",
  account_phone: "Your parent’s phone can’t be your login phone.",
  phone_unverified: "Your account phone isn’t verified.",
  not_student: "Parent phone is available for student accounts only.",
  cooldown: "Wait a moment before requesting another code.",
  rate_limited: "Too many codes were requested. Try again later.",
  delivery_failed: "Couldn’t send the code. Try again.",
  delivery_unavailable: "Couldn’t send the code. Try again later.",
  invalid_code: "That code is incorrect.",
  expired: "This code has expired. Request a new one.",
  unsent: "Request a code first.",
  locked: "Too many attempts. Start again.",
  busy: "This change is already being saved. Try again in a moment.",
  stale: "Your contact changed elsewhere. Start again.",
  used: "This change has ended. Start again.",
  invalid: "This change has ended. Start again.",
  ended: "This change has ended. Start again.",
  unverified: "Verify both numbers first.",
  commit_failed: "Couldn’t save your new number. Try again.",
  uncertain: "We couldn’t confirm whether your number changed. Reload to check.",
  session_inactive: "Your session has ended. Sign in again.",
  not_authenticated: "Your session has ended. Sign in again.",
};

export function contactErrorMessage(failure: PasswordFailure | string) {
  return MESSAGES[typeof failure === "string" ? failure : failure.error] ?? "Something went wrong. Try again.";
}

/** Failures after which the operation can no longer continue, so the flow returns to the start. */
export function endsContactChange(error: string) {
  return [
    "locked", "stale", "used", "invalid", "ended", "phone_taken", "parent_phone", "account_phone", "same_phone",
    "session_inactive", "not_authenticated",
  ].includes(error);
}

/** Status after the current number's step fails: there is no settings bypass for an unreachable number. */
export const OLD_NUMBER_UNREACHABLE = "If you can’t receive codes on your current number, it can’t be changed here.";

/** Domestic display form (01…) of a stored +20 number. */
export const displayPhone = (phone: string) => phone.replace(/^\+20/, "0");
