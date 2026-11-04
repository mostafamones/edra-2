import type { CouponBatch, CouponType } from "../src/modules/content/coupons/types";

const state = new URLSearchParams(location.search).get("state");
const types: CouponType[] = [
  { id: "regular", programId: null, yearId: "year", levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true },
  { id: "revision", programId: null, yearId: "year", levelId: null, trackId: null, name: "Revision · مراجعة نهائية", prefix: "REV", isDefault: false, allTracks: true },
];
const batches: CouponBatch[] = types.map((type, index) => ({ id: `batch-${index}`, type_name: type.name, prefix: type.prefix, quantity: index ? 1000 : 48, redeemed: index ? 25 : 20, revoked: index ? 0 : 4, closed: false, level: null, track: null, created_by_name: "Preview", created_at: "2026-10-27T10:00:00Z" }));
const ok = <T,>(value: T) => ({ ok: true as const, value });
let failed = false;
export async function loadCouponOptions() { return ok({ userId: "preview-staff", programs: [{ id: "scope", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Second Secondary", trackId: "science", track: "Scientific" }], types }); }
export async function loadCouponBatches({ search, prefix }: { search: string; prefix: string | null }) {
  if (state === "loading") return new Promise<never>(() => {});
  if (state === "error" && !failed) { failed = true; throw new Error("Service unavailable. Try again."); }
  return ok({ userId: "preview-staff", manager: true, hasMore: false, batches: state === "empty" ? [] : batches.filter(batch => (!prefix || batch.prefix === prefix) && batch.type_name.toLowerCase().includes(search.toLowerCase())) });
}
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Deterministic codes; the Revision batch keeps its original RVN prefix after the type moved to REV.
function codes(batch: CouponBatch) {
  return Array.from({ length: batch.quantity }, (_, i) => ({
    id: `${batch.id}-${i}`, code: Array.from({ length: 8 }, (_, d) => ALPHABET[(i * 7 + d * 13 + Math.floor(i / 31 ** (d % 2))) % 31]).join(""), prefix: batch.id === "batch-1" ? "RVN" : batch.prefix,
    status: i < batch.redeemed ? "redeemed" as const : i < batch.redeemed + batch.revoked ? "revoked" as const : "unused" as const,
    redeemed_at: i < batch.redeemed ? "2026-10-28T10:00:00Z" : null, student_name: i < batch.redeemed ? "Preview student" : null, unit_title: i < batch.redeemed ? "Unit 1" : null,
  }));
}
export async function loadCouponBatch({ batchId }: { batchId: string }) { return ok({ userId: "preview-staff", manager: true, codes: codes(batches.find(batch => batch.id === batchId)!) }); }
const noWrite = async () => ({ ok: false as const, message: "Preview only. Changes are not saved." });
export const generateCoupons = noWrite;
export const createCouponType = noWrite;
export const changeCouponPrefix = noWrite;
export const renameCouponType = noWrite;
export const deleteCouponType = noWrite;
export const revokeCoupon = noWrite;
