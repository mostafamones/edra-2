import { expect, it } from "vitest";
import { availableCouponTypes, couponInput, couponOptionsSchema, formatCoupon, matchesScope } from "./types";
import { redeemInput } from "../access/types";

it("accepts hand-entered audience prefixes and excludes ambiguous random characters", () => {
  expect(couponInput.parse(" ab7k - 9m3r ")).toBe("AB7K9M3R");
  expect(formatCoupon("AB7K9M3R")).toBe("AB7K-9M3R");
  expect(couponInput.parse("reg-ab7k-9m3r")).toBe("REGAB7K9M3R");
  expect(formatCoupon("AB7K9M3R", "REG")).toBe("REG-AB7K-9M3R");
  expect(couponInput.parse("s2-sci-reg-ab7k-9m3r")).toBe("S2SCIREGAB7K9M3R");
  expect(formatCoupon("S2-SCI-REG-AB7K-9M3R")).toBe("S2-SCI-REG-AB7K-9M3R");
  expect(formatCoupon("AB7K9M3R", "S2-SCI-REG")).toBe("S2-SCI-REG-AB7K-9M3R");
  for (const value of ["AB7K9M30", "AB7K9M3I", "AB7K9M3O", "AB7K9M3L", "bad!prefix-AB7K9M3R"]) {
    expect(couponInput.safeParse(value).success).toBe(false);
  }
  expect(redeemInput.safeParse({ academyId: crypto.randomUUID(), unitId: crypto.randomUUID(), requestId: crypto.randomUUID(), code: "s2-sci-reg-ab7k-9m3r" }).success).toBe(true);
});
it("tolerates legacy global read records but excludes them from new choices", () => {
  const yearId = crypto.randomUUID(), id = crypto.randomUUID();
  const scope = { id: crypto.randomUUID(), yearId, year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: crypto.randomUUID(), track: "Science" };
  const parsed = couponOptionsSchema.parse({ programs: [scope], types: [{ id, yearId, programId: null, levelId: null, trackId: null, name: "Regular", prefix: "REG", isDefault: true, allTracks: true }] });
  expect(matchesScope(parsed.types[0], scope)).toBe(false);
  expect(matchesScope(parsed.types[0], { ...scope, yearId: crypto.randomUUID() })).toBe(false);
  expect(availableCouponTypes(parsed.types, scope)).toHaveLength(1);
  const gradeDefault = { ...parsed.types[0], id: crypto.randomUUID(), levelId: scope.levelId, trackId: scope.trackId, allTracks: false, programId: crypto.randomUUID() };
  expect(availableCouponTypes([parsed.types[0], gradeDefault], scope)[0]).toEqual(gradeDefault);
});
it("matches the immutable academic scope, including exact optional track", () => {
  const scope = { id: "program", yearId: "year", year: 2026, closed: false, levelId: "grade", level: "Grade", trackId: "science", track: "Science" };
  const type = { id: "type", programId: "older-program-same-scope", yearId: "year", levelId: "grade", trackId: "science", name: "Regular", prefix: "REG", isDefault: true, allTracks: false };
  expect(matchesScope(type, scope)).toBe(true);
  expect(matchesScope({ ...type, trackId: null }, scope)).toBe(false);
  expect(matchesScope({ ...type, trackId: null, allTracks: true }, scope)).toBe(false);
  expect(matchesScope({ ...type, trackId: null, allTracks: true, levelId: "other" }, scope)).toBe(false);
  expect(matchesScope({ ...type, yearId: "previous" }, scope)).toBe(false);
  expect(matchesScope({ ...type, levelId: "other" }, scope)).toBe(false);
  expect(availableCouponTypes([], scope)).toEqual([expect.objectContaining({ name: "Regular", isDefault: true, trackId: "science", allTracks: false, virtual: true })]);
  expect(availableCouponTypes([{ ...type, trackId: null, allTracks: true }], scope)).toHaveLength(1);
  expect(availableCouponTypes([], { ...scope, closed: true })).toHaveLength(0);
});
