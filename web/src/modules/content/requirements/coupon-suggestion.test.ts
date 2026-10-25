import { expect, it } from "vitest";
import { isRevision, suggestCoupon } from "./coupon-suggestion";
const types = [{id:"regular",name:"Regular"},{id:"revision",name:"Revision"},{id:"arabic",name:"مراجعة نهائية"}];
it("recognizes English and normalized Arabic revision titles", () => {
  for (const title of ["Chapter 2 revision", "Quick recap", "مُرَاجَعَة نهائية", "المراجعه الشاملة", "ملخص الدرس"]) expect(isRevision(title)).toBe(true);
  expect(isRevision("Lesson 2 — introduction")).toBe(false);
});
it("suggests a matching type without replacing a correct manual selection", () => {
  expect(suggestCoupon("Final revision", "regular", types)?.id).toBe("revision");
  expect(suggestCoupon("مراجعة نهائية", "regular", types)?.id).toBe("arabic");
  expect(suggestCoupon("Revision 2", "revision", types)).toBeNull();
  expect(suggestCoupon("Lesson 2", "revision", types)?.id).toBe("regular");
});
it("does not invent a missing type or suggest against an empty title", () => {
  expect(suggestCoupon("Revision", "regular", types.slice(0,1))).toBeNull();
  expect(suggestCoupon("", "revision", types)).toBeNull();
});
