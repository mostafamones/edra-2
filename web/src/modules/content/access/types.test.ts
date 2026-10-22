import { expect, it } from "vitest";
import { learningUnitSchema, staffGrantInput, unitInput } from "./types";

it("accepts Postgres UUID identities from the development academy without requiring UUID version bits", () => {
  const id = "12345678-1234-0234-1234-123456789abc";
  expect(unitInput.parse({ academyId: id, unitId: id })).toEqual({ academyId: id, unitId: id });
  expect(staffGrantInput.safeParse({ academyId: id, unitId: id, recordId: id, requestId: id, expectedGrantId: null, expectedRevision: 1 }).success).toBe(true);
  expect(learningUnitSchema.safeParse({ id, title: "Review", description: "", accessDays: 7, access: { status: "locked", expiresAt: null, grantId: null }, extensionAvailable: true, items: [{ id, title: "Notes", kind: "document", available: false, assessmentKind: null }] }).success).toBe(true);
  expect(unitInput.safeParse({ academyId: "another-academy", unitId: id }).success).toBe(false);
});
