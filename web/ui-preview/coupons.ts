import type { CouponBatch, CouponType } from "../src/modules/content/coupons/types";

const state = new URLSearchParams(location.search).get("state");
const types: CouponType[] = [
  { id: "regular", programId: null, yearId: "year", levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true },
  { id: "revision", programId: null, yearId: "year", levelId: null, trackId: null, name: "Revision · مراجعة نهائية", prefix: "REV", isDefault: false, allTracks: true },
];
const batches: CouponBatch[] = types.map((type, index) => ({ id: `batch-${index}`, type_name: type.name, prefix: type.prefix, quantity: index ? 25 : 50, redeemed: index ? 8 : 32, revoked: 0, closed: false, level: null, track: null, created_by_name: "Preview", created_at: "2026-10-27T10:00:00Z" }));
const ok = <T,>(value: T) => ({ ok: true as const, value });
let failed = false;
export async function loadCouponOptions() { return ok({ userId: "preview-staff", programs: [{ id: "scope", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Second Secondary", trackId: "science", track: "Scientific" }], types }); }
export async function loadCouponBatches({ search, prefix }: { search: string; prefix: string | null }) {
  if (state === "loading") return new Promise<never>(() => {});
  if (state === "error" && !failed) { failed = true; throw new Error("Service unavailable. Try again."); }
  return ok({ userId: "preview-staff", manager: true, hasMore: false, batches: state === "empty" ? [] : batches.filter(batch => (!prefix || batch.prefix === prefix) && batch.type_name.toLowerCase().includes(search.toLowerCase())) });
}
export async function loadCouponBatch() { return ok({ userId: "preview-staff", manager: true, codes: [] }); }
const noWrite = async () => ({ ok: false as const, message: "Preview only. Changes are not saved." });
export const generateCoupons = noWrite;
export const createCouponType = noWrite;
export const changeCouponPrefix = noWrite;
export const renameCouponType = noWrite;
export const deleteCouponType = noWrite;
export const revokeCoupon = noWrite;
