import { expect, it } from "vitest";
import { availableCouponTypes, couponBatchPageSchema, couponInput, couponOptionsSchema, formatCoupon, matchesScope, withAcademyScopes } from "./types";
import { redeemInput } from "../access/types";

it("accepts hand-entered coupons and excludes ambiguous characters and legacy codes", () => {
  expect(couponInput.parse(" ab7k - 9m3r ")).toBe("AB7K9M3R");
  expect(formatCoupon("AB7K9M3R")).toBe("AB7K-9M3R");
  expect(couponInput.parse("reg-ab7k-9m3r")).toBe("REGAB7K9M3R");
  expect(formatCoupon("AB7K9M3R", "REG")).toBe("REG-AB7K-9M3R");
  for (const value of ["AB7K9M30", "AB7K9M3I", "AB7K9M3O", "AB7K9M3L", "abcdabcdabcdabcdabcdabcdabcdabcd"]) {
    expect(couponInput.safeParse(value).success).toBe(false);
  }
  expect(redeemInput.safeParse({ academyId: crypto.randomUUID(), unitId: crypto.randomUUID(), requestId: crypto.randomUUID(), code: "abcdabcdabcdabcdabcdabcdabcdabcd" }).success).toBe(false);
});
it("accepts academy-wide types without inventing a grade or program", () => {
  const yearId = crypto.randomUUID(), id = crypto.randomUUID();
  const scope = { id: crypto.randomUUID(), yearId, year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: crypto.randomUUID(), track: "Science" };
  const parsed = couponOptionsSchema.parse({ programs: [scope], types: [{ id, yearId, programId: null, levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true }] });
  expect(matchesScope(parsed.types[0], { ...scope, levelId: null, level: null, trackId: null, track: null })).toBe(true);
  expect(matchesScope(parsed.types[0], { ...scope, yearId: crypto.randomUUID() })).toBe(false);
  expect(availableCouponTypes(parsed.types, scope)).toHaveLength(0);
  const gradeDefault = { ...parsed.types[0], id: crypto.randomUUID(), levelId: scope.levelId, programId: crypto.randomUUID() };
  expect(availableCouponTypes([parsed.types[0], gradeDefault], scope)[0]).toEqual(gradeDefault);
});
it("matches the immutable academic scope, including exact optional track", () => {
  const scope = { id: "program", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: "science", track: "Science" };
  const type = { id: "type", programId: "older-program-same-scope", yearId: "year", levelId: "grade", trackId: "science", name: "Regular", prefix: "REG", isDefault: true, allTracks: false };
  expect(matchesScope(type, scope)).toBe(true);
  expect(matchesScope({ ...type, trackId: null }, scope)).toBe(false);
  expect(matchesScope({ ...type, trackId: null, allTracks: true }, scope)).toBe(true);
  expect(matchesScope({ ...type, trackId: null, allTracks: true, levelId: "other" }, scope)).toBe(false);
  expect(matchesScope({ ...type, yearId: "previous" }, scope)).toBe(false);
  expect(matchesScope({ ...type, levelId: "other" }, scope)).toBe(false);
  expect(availableCouponTypes([], scope)).toHaveLength(0);
  expect(availableCouponTypes([{ ...type, trackId: null, allTracks: true }], scope)).toHaveLength(1);
});
it("treats a null level as the whole academy", () => {
  const grade = { id: "program", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: null, track: null };
  const [academy] = withAcademyScopes([grade]);
  expect(academy).toMatchObject({ id: "year", levelId: null });
  const type = { id: "type", programId: null, yearId: "year", levelId: null, trackId: null, name: "Pass", prefix: "PAS", isDefault: false, allTracks: true };
  expect(matchesScope(type, academy)).toBe(true);
  expect(matchesScope(type, grade)).toBe(false);
  expect(availableCouponTypes([], academy)).toEqual([expect.objectContaining({ name: "Regular", isDefault: true, virtual: true })]);
  expect(availableCouponTypes([], { ...academy, closed: true })).toHaveLength(0);
});

it("lists issued batches whose printed prefix predates the current prefix rule", () => {
  const batch = { id: "00000000-0000-4000-8000-000000000001", created_at: "2026-10-24T22:40:06Z", quantity: 1, type_name: "Regular", level: "Secondary 2", track: null, created_by_name: null, closed: false, redeemed: 0, revoked: 0 };
  expect(couponBatchPageSchema.parse({ manager: true, hasMore: false, batches: [{ ...batch, prefix: "S2-LIT-REG" }] }).batches[0].prefix).toBe("S2-LIT-REG");
  expect(() => couponBatchPageSchema.parse({ manager: true, hasMore: false, batches: [{ ...batch, prefix: "s2 lit" }] })).toThrow();
});
