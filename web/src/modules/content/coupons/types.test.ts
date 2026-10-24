import { expect, it } from "vitest";
import { availableCouponTypes, couponInput, formatCoupon, matchesScope } from "./types";
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
it("matches the immutable academic scope, including exact optional track", () => {
  const scope = { id: "program", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: "science", track: "Science" };
  const type = { id: "type", programId: "older-program-same-scope", yearId: "year", levelId: "grade", trackId: "science", name: "Regular", prefix: "REG", isDefault: true, allTracks: false };
  expect(matchesScope(type, scope)).toBe(true);
  expect(matchesScope({ ...type, trackId: null }, scope)).toBe(false);
  expect(matchesScope({ ...type, trackId: null, allTracks: true }, scope)).toBe(true);
  expect(matchesScope({ ...type, trackId: null, allTracks: true, levelId: "other" }, scope)).toBe(false);
  expect(matchesScope({ ...type, yearId: "previous" }, scope)).toBe(false);
  expect(matchesScope({ ...type, levelId: "other" }, scope)).toBe(false);
  expect(availableCouponTypes([], scope)).toEqual([expect.objectContaining({ name: "Regular", isDefault: true, allTracks: true, virtual: true })]);
  expect(availableCouponTypes([{ ...type, trackId: null, allTracks: true }], scope)).toHaveLength(1);
  expect(availableCouponTypes([], { ...scope, closed: true })).toHaveLength(0);
});
