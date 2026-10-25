import { z } from "zod";
import { REDEMPTION_PATTERN, normalizeCoupon } from "../coupons/types";

export const accessSchema = z.object({ status: z.enum(["locked", "active", "expired", "revoked"]), expiresAt: z.string().nullable(), grantId: z.guid().nullable() });
export type LearningAccess = z.infer<typeof accessSchema>;
export const accessLabels = { locked: "Locked", active: "Available", expired: "Expired", revoked: "Revoked" };
export const unitInput = z.object({ academyId: z.guid(), unitId: z.guid() });
export const requestInput = unitInput.extend({ requestId: z.guid() });
export const staffGrantInput = requestInput.extend({ recordId: z.guid(), expectedGrantId: z.guid().nullable(), expectedRevision: z.number().int().positive(), extensionHours: z.number().int().min(1).max(2147483647).optional() });
export const grantReceiptSchema = z.object({ grantId: z.guid(), issuedAt: z.string(), expiresAt: z.string(), previousExpiry: z.string().nullable() });
export const workspaceSchema = z.object({
  records: z.array(z.object({ id: z.guid(), name: z.string(), phone: z.string(), connected: z.boolean(), suspended: z.boolean(), access: accessSchema })),
  recordsHasMore: z.boolean(),
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
  couponType: z.string().nullable().optional(), prerequisitesMet: z.boolean().default(true),
  prerequisites: z.array(z.object({ unitId: z.guid(), kind: z.enum(["access", "assignment", "quiz"]), assessmentId: z.guid().nullable(), unitTitle: z.string(), title: z.string(), submitted: z.boolean() })).default([]),
  items: z.array(z.object({ id: z.guid(), kind: z.enum(["explanation", "document", "assessment", "answer"]), title: z.string(), available: z.boolean(), assessmentKind: z.enum(["assignment", "quiz", "exam"]).nullable(), assessmentId: z.guid().optional() })),
});
export type LearningUnit = z.infer<typeof learningUnitSchema>;
export const materialSchema = z.object({ kind: z.enum(["video", "document"]), playbackId: z.string().nullable(), storagePath: z.string().nullable(), expiresAt: z.string() });
export function normalizeUnitCode(value: string) { return normalizeCoupon(value); }
export function isValidAccessCode(value: string) { return REDEMPTION_PATTERN.test(value); }
export const redeemInput = requestInput.extend({ code: z.string().max(100).transform(normalizeUnitCode).refine(isValidAccessCode, "Enter a valid coupon.") });
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
    code_unavailable: "This coupon is not available.", code_used: "This code, or your code allowance for this unit, has already been used.",
    coupon_type_mismatch: "This coupon does not match this unit’s track and coupon type.",
    prerequisites_required: "Complete this unit’s unlock and submission requirements first.",
    coupon_rate_limited: "Too many coupon attempts. Try again in ten minutes.",
    coupon_type_exists: "A coupon type with this name already exists in this scope.",
    coupon_type_in_use: "Units still use this coupon type. Change their coupon type first.",
    access_required: "Active unit access is required.", material_unavailable: "This material is not available.",
    validation: "Check the fields and try again.",
  };
  throw new Error(messages[error.message ?? ""] ?? "Could not complete this action. Please retry.");
}
