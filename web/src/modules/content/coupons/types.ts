import { z } from "zod";

export const COUPON_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export function normalizeCoupon(value: string) { return value.replace(/[\s-]/g, "").toUpperCase(); }
export function formatCoupon(value: string) { return `${value.slice(0, 4)}-${value.slice(4)}`; }
export const couponInput = z.string().max(100).transform(normalizeCoupon).pipe(z.string().regex(COUPON_PATTERN, "Enter an eight-character coupon."));
export const couponScopeSchema = z.object({ id: z.guid(), yearId: z.guid(), year: z.number(), closed: z.boolean(), levelId: z.string(), level: z.string(), trackId: z.guid().nullable(), track: z.string().nullable() });
export type CouponScope = z.infer<typeof couponScopeSchema>;
export const couponTypeSchema = z.object({ id: z.guid(), programId: z.guid(), yearId: z.guid(), levelId: z.string(), trackId: z.guid().nullable(), name: z.string() });
export type CouponType = z.infer<typeof couponTypeSchema>;
export function matchesScope(type: CouponType, scope: CouponScope) { return type.yearId === scope.yearId && type.levelId === scope.levelId && type.trackId === scope.trackId; }
export function scopeLabel(scope: CouponScope) { return `${scope.year}–${scope.year + 1} · ${scope.level}${scope.track ? ` · ${scope.track}` : " · No track"}`; }
export const couponOptionsSchema = z.object({ programs: z.array(couponScopeSchema), types: z.array(couponTypeSchema) });
export const couponPageSchema = z.object({ manager: z.boolean(), hasMore: z.boolean(), codes: z.array(z.object({
  id: z.guid(), code: z.string().regex(COUPON_PATTERN), type_id: z.guid(), type_name: z.string(),
  created_at: z.string(), status: z.enum(["unused", "redeemed", "revoked"]), revoked_at: z.string().nullable(),
  redeemed_at: z.string().nullable(), unit_id: z.guid().nullable(), unit_title: z.string().nullable(), student_name: z.string().nullable(),
})) });
export const couponBatchSchema = z.object({ batchId: z.guid(), codes: z.array(z.object({ id: z.guid(), code: z.string().regex(COUPON_PATTERN) })) });
