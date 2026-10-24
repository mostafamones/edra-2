import { z } from "zod";

export const COUPON_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const REDEMPTION_PATTERN = /^([A-Z0-9]{2,28})?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const typePrefixSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "Enter two to four letters.");
export const prefixSchema = z.string().trim().toUpperCase().min(2).max(32).regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
export function normalizeCoupon(value: string) { return value.replace(/[\s-]/g, "").toUpperCase(); }
export function formatCoupon(value: string, prefix?: string) { const normalized = normalizeCoupon(value); const code = normalized.slice(-8); const entered = value.replace(/\s/g, "").toUpperCase(); const ending = entered.match(/-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/)?.[0]; const label = prefix ?? (ending ? entered.slice(0, -ending.length) : normalized.slice(0, -8)); return `${label ? `${label}-` : ""}${code.slice(0, 4)}-${code.slice(4)}`; }
export const couponInput = z.string().max(100).transform(normalizeCoupon).pipe(z.string().regex(REDEMPTION_PATTERN, "Enter a valid coupon."));
export const couponScopeSchema = z.object({ id: z.guid(), yearId: z.guid(), year: z.number(), closed: z.boolean(), levelId: z.string(), level: z.string(), trackId: z.guid().nullable(), track: z.string().nullable(), prefix: z.string().optional() });
export type CouponScope = z.infer<typeof couponScopeSchema>;
export const couponTypeSchema = z.object({ id: z.guid(), programId: z.guid().nullable(), yearId: z.guid(), levelId: z.string().nullable(), trackId: z.guid().nullable(), name: z.string(), prefix: prefixSchema, isDefault: z.boolean(), allTracks: z.boolean() });
export type CouponType = z.infer<typeof couponTypeSchema>;
export type AvailableCouponType = CouponType & { virtual?: boolean };
export function defaultCouponType(types: AvailableCouponType[]) { return types.find(type => type.isDefault); }
export function couponTypeGroups(types: AvailableCouponType[], scope: CouponScope) {
  return [
    { label: `${scope.level} · ${scope.track ?? "Whole grade"}`, types: types.filter(type => matchesScope(type, scope)) },
  ].filter(group => group.types.length);
}
export function availableCouponTypes(types: CouponType[], scope: CouponScope): Array<CouponType & { virtual?: boolean }> {
  const matching: Array<CouponType & { virtual?: boolean }> = types.filter(type => matchesScope(type, scope));
  if (!scope.closed && !matching.some(type => type.isDefault)) matching.unshift({ id: scope.id, programId: scope.id, yearId: scope.yearId, levelId: scope.levelId, trackId: scope.trackId, name: "Regular", prefix: `${scope.prefix ?? "REG"}${scope.prefix ? "-REG" : ""}`, isDefault: true, allTracks: scope.trackId === null, virtual: true });
  return matching;
}
export function matchesScope(type: CouponType, scope: CouponScope) { return type.yearId === scope.yearId && type.levelId === scope.levelId && type.trackId === scope.trackId; }
export function scopeLabel(scope: CouponScope) { return `${scope.year}–${scope.year + 1} · ${scope.level}${scope.track ? ` · ${scope.track}` : " · Whole grade"}`; }
export const couponOptionsSchema = z.object({ programs: z.array(couponScopeSchema), types: z.array(couponTypeSchema) });
export const couponPageSchema = z.object({ manager: z.boolean(), hasMore: z.boolean(), codes: z.array(z.object({
  id: z.guid(), code: z.string().regex(COUPON_PATTERN), prefix: prefixSchema, type_id: z.guid(), type_name: z.string(),
  created_at: z.string(), status: z.enum(["unused", "redeemed", "revoked"]), revoked_at: z.string().nullable(),
  redeemed_at: z.string().nullable(), unit_id: z.guid().nullable(), unit_title: z.string().nullable(), student_name: z.string().nullable(),
})) });
export const couponBatchSchema = z.object({ batchId: z.guid(), codes: z.array(z.object({ id: z.guid(), code: z.string().regex(COUPON_PATTERN), prefix: prefixSchema.default("TYPE") })) });
