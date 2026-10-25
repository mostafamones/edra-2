import { z } from "zod";

export const COUPON_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const REDEMPTION_PATTERN = /^([A-Z]{2,4})?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const prefixSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "Enter two to four letters.");
// Issued batches keep the prefix printed on their coupons, which may predate the current rule.
const issuedPrefixSchema = z.string().regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/);
export function normalizeCoupon(value: string) { return value.replace(/[\s-]/g, "").toUpperCase(); }
export function formatCoupon(value: string, prefix?: string) { const normalized = normalizeCoupon(value); const code = normalized.slice(-8); const label = prefix ?? normalized.slice(0, -8); return `${label ? `${label}-` : ""}${code.slice(0, 4)}-${code.slice(4)}`; }
export const couponInput = z.string().max(100).transform(normalizeCoupon).pipe(z.string().regex(REDEMPTION_PATTERN, "Enter a valid coupon."));
// A null level is the whole academy for that year.
export const couponScopeSchema = z.object({ id: z.guid(), yearId: z.guid(), year: z.number(), closed: z.boolean(), levelId: z.string().nullable(), level: z.string().nullable(), trackId: z.guid().nullable(), track: z.string().nullable() });
export type CouponScope = z.infer<typeof couponScopeSchema>;
export const couponTypeSchema = z.object({ id: z.guid(), programId: z.guid().nullable(), yearId: z.guid(), levelId: z.string().nullable(), trackId: z.guid().nullable(), name: z.string(), prefix: prefixSchema, isDefault: z.boolean(), allTracks: z.boolean() });
export type CouponType = z.infer<typeof couponTypeSchema>;
export function availableCouponTypes(types: CouponType[], scope: CouponScope): Array<CouponType & { virtual?: boolean }> {
  const matching: Array<CouponType & { virtual?: boolean }> = types.filter(type => matchesScope(type, scope));
  if (!scope.closed && scope.levelId === null && !matching.some(type => type.isDefault)) matching.unshift({ id: scope.id, programId: null, yearId: scope.yearId, levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true, virtual: true });
  return matching;
}
export function matchesScope(type: CouponType, scope: CouponScope) { return type.yearId === scope.yearId && type.levelId === scope.levelId && (scope.levelId === null || type.allTracks || type.trackId === scope.trackId); }
/** One whole-academy scope per active year, listed before the grades. */
export function withAcademyScopes(programs: CouponScope[]): CouponScope[] {
  const years = [...new Map(programs.map(p => [p.yearId, p])).values()];
  return years.map(p => ({ id: p.yearId, yearId: p.yearId, year: p.year, closed: p.closed, levelId: null, level: null, trackId: null, track: null }));
}
export function scopeLabel(scope: CouponScope) { if (scope.levelId === null) return "Whole academy"; return `${scope.level}${scope.track ? ` · ${scope.track}` : ""}`; }
export const couponOptionsSchema = z.object({ programs: z.array(couponScopeSchema), types: z.array(couponTypeSchema) });
export const couponBatchPageSchema = z.object({ manager: z.boolean(), hasMore: z.boolean(), batches: z.array(z.object({
  id: z.guid(), created_at: z.string(), prefix: issuedPrefixSchema, quantity: z.number(), type_name: z.string(), level: z.string().nullable(), track: z.string().nullable(),
  created_by_name: z.string().nullable(), closed: z.boolean(), redeemed: z.number(), revoked: z.number(),
})) });
export type CouponBatch = z.infer<typeof couponBatchPageSchema>["batches"][number];
export function batchProgram(batch: CouponBatch) { return batch.level === null ? "Whole academy" : `${batch.level}${batch.track ? ` · ${batch.track}` : ""}`; }
export const couponBatchCodesSchema = z.object({ manager: z.boolean(), codes: z.array(z.object({
  id: z.guid(), code: z.string().regex(COUPON_PATTERN), prefix: issuedPrefixSchema, status: z.enum(["unused", "redeemed", "revoked"]),
  redeemed_at: z.string().nullable(), student_name: z.string().nullable(), unit_title: z.string().nullable(),
})) });
export const couponBatchSchema = z.object({ batchId: z.guid(), codes: z.array(z.object({ id: z.guid(), code: z.string().regex(COUPON_PATTERN), prefix: prefixSchema.default("TYPE") })) });
