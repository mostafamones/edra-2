import { z } from "zod";

export const accessSchema = z.object({ status: z.enum(["locked", "active", "expired", "revoked"]), expiresAt: z.string().nullable(), grantId: z.guid().nullable() });
export type LearningAccess = z.infer<typeof accessSchema>;
export const accessLabels = { locked: "Locked", active: "Available", expired: "Expired", revoked: "Revoked" };
export const unitInput = z.object({ academyId: z.guid(), unitId: z.guid() });
export const requestInput = unitInput.extend({ requestId: z.guid() });
export const staffGrantInput = requestInput.extend({ recordId: z.guid(), expectedGrantId: z.guid().nullable(), expectedRevision: z.number().int().positive(), extensionHours: z.number().int().min(1).max(2147483647).optional() });
export const grantReceiptSchema = z.object({ grantId: z.guid(), issuedAt: z.string(), expiresAt: z.string(), previousExpiry: z.string().nullable() });
export const generatedCodesSchema = z.object({ batchId: z.guid(), codes: z.array(z.object({ id: z.guid(), code: z.string().regex(/^[0-9a-f]{32}$/) })) });
export const workspaceSchema = z.object({
  records: z.array(z.object({ id: z.guid(), name: z.string(), phone: z.string(), connected: z.boolean(), suspended: z.boolean(), access: accessSchema })),
  recordsHasMore: z.boolean(), codesHasMore: z.boolean(),
  codes: z.array(z.object({ id: z.guid(), code: z.string(), createdAt: z.string(), redeemed: z.boolean(), revoked: z.boolean() })),
  defaultDays: z.number().int().positive(), publishedRevision: z.number().int().nonnegative(), canIssue: z.boolean(), manager: z.boolean(),
});
export type AccessWorkspace = z.infer<typeof workspaceSchema>;
export type AccessRecord = AccessWorkspace["records"][number];
export const historySchema = z.array(z.object({ id: z.guid(), kind: z.string(), issuedAt: z.string(), startsAt: z.string(), expiresAt: z.string(), previousExpiry: z.string().nullable(), actorId: z.guid(), revokedAt: z.string().nullable(), reason: z.string().nullable() }));
export type AccessHistory = z.infer<typeof historySchema>;
export const learningListSchema = z.object({ units: z.array(z.object({ id: z.guid(), title: z.string(), materialCount: z.number().int(), publishedAt: z.string(), access: accessSchema })), hasMore: z.boolean() });
export type LearningList = z.infer<typeof learningListSchema>;
export const learningUnitSchema = z.object({
  id: z.guid(), title: z.string(), description: z.string(), accessDays: z.number().int().positive(), access: accessSchema, extensionAvailable: z.boolean(),
  items: z.array(z.object({ id: z.guid(), kind: z.enum(["explanation", "document", "assessment", "answer"]), title: z.string(), available: z.boolean(), assessmentKind: z.enum(["assignment", "quiz", "exam"]).nullable(), assessmentId: z.guid().optional() })),
});
export type LearningUnit = z.infer<typeof learningUnitSchema>;
export const materialSchema = z.object({ kind: z.enum(["video", "document"]), playbackId: z.string().nullable(), storagePath: z.string().nullable(), expiresAt: z.string() });
export function normalizeUnitCode(value: string) { return value.toLowerCase().replace(/[\s-]/g, ""); }
export const redeemInput = requestInput.extend({ code: z.string().max(100).transform(normalizeUnitCode).pipe(z.string().regex(/^[0-9a-f]{32}$/, "Enter a valid unit code.")) });
export function learningDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(value)) : "—"; }

export function learningError(error: { message?: string } | null) {
  if (!error) return;
  const messages: Record<string, string> = {
    forbidden: "You do not have permission for this action.", student_unavailable: "This student account or placement is unavailable.",
    content_unavailable: "This unit is not available.", year_closed: "This academic year is closed.",
    content_conflict: "Access or published content changed. Close this action, refresh and review again.",
    request_conflict: "This request no longer matches. Close the action and start again.",
    previous_access_required: "This unit needs a previous access grant before it can be extended.",
    access_not_expired: "Your access has not expired yet.", access_revoked: "This access has been revoked.",
    extension_used: "Your academy’s extension for this academic year has already been used.",
    code_unavailable: "This unit code is not available.", code_used: "This code, or your code allowance for this unit, has already been used.",
    access_required: "Active unit access is required.", material_unavailable: "This material is not available.",
    validation: "Check the fields and try again.",
  };
  throw new Error(messages[error.message ?? ""] ?? "Could not complete this action. Please retry.");
}
