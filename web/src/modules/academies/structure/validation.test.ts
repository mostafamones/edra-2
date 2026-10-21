import { describe, expect, it } from "vitest";

import { offeringChangeSchema, offeringRequestSchema, structureSchema } from "./validation";
import { academyStructureKey, offeringAffectedKeys } from "./query-keys";

describe("offering input boundary", () => {
  it("reuses trimmed track names and the established length limit", () => {
    expect(offeringChangeSchema.parse({ operation: "add_track", levelId: "secondary-2", name: "  Scientific  " })).toEqual({
      operation: "add_track", levelId: "secondary-2", name: "Scientific",
    });
    for (const name of [" ", "x".repeat(61)]) {
      expect(offeringChangeSchema.safeParse({ operation: "add_track", levelId: "secondary-2", name }).success).toBe(false);
    }
  });
  it("rejects catalog creation/rename, legacy levels, forged scope and incomplete requests", () => {
    for (const change of [
      { operation: "rename_level", levelId: "secondary-2", name: "New" },
      { operation: "add_level", levelId: "grade-10" },
      { operation: "add_level", levelId: "secondary-2", academyId: "foreign" },
      { operation: "rename_track", levelId: "secondary-2", name: "New" },
    ]) expect(offeringChangeSchema.safeParse(change).success).toBe(false);
    expect(offeringRequestSchema.safeParse({ change: { operation: "stop_level", levelId: "secondary-2" }, revision: 1 }).success).toBe(false);
  });
  it("requires an account scope in database responses and cache keys", () => {
    expect(structureSchema.safeParse({ academyId: "12900000-0000-4000-8000-000000000001", levels: [], canManage: true, revision: 1 }).success).toBe(false);
    expect(academyStructureKey("account-a", "academy-a")).not.toEqual(academyStructureKey("account-b", "academy-a"));
    for (const key of offeringAffectedKeys("account-a", "academy-a")) expect(key).toContain("academy-a");
  });
});
