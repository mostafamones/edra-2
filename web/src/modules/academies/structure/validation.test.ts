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
  it("accepts deterministic non-RFC database ids and rejects malformed ones", () => {
    const academyId = "c6c6d388-e7e1-7e94-e2ec-60219c2bc597";
    const trackId = "02bf25b2-49df-e305-2d71-7590c36ca312";
    const structure = {
      academyId, accountId: "1de4d007-11ec-4290-85f6-73f8937ce083", canManage: true, revision: 1,
      levels: [{ id: "secondary-2", name: "Secondary 2", version: 1, stoppedAt: null, resumedAt: null, dependencies: {},
        tracks: [{ id: trackId, name: "Scientific", retiredAt: null, version: 1 }] }],
    };
    expect(structureSchema.parse(structure).levels[0].tracks[0].id).toBe(trackId);
    expect(offeringChangeSchema.safeParse({ operation: "remove_track", levelId: "secondary-2", trackId }).success).toBe(true);
    for (const bad of ["c6c6d388-e7e1-7e94-e2ec-60219c2bc59", "c6c6d388e7e17e94e2ec60219c2bc597", "g6c6d388-e7e1-7e94-e2ec-60219c2bc597"]) {
      expect(offeringChangeSchema.safeParse({ operation: "remove_track", levelId: "secondary-2", trackId: bad }).success).toBe(false);
      expect(structureSchema.safeParse({ ...structure, academyId: bad }).success).toBe(false);
    }
  });
  it("requires an account scope in database responses and cache keys", () => {
    expect(structureSchema.safeParse({ academyId: "12900000-0000-4000-8000-000000000001", levels: [], canManage: true, revision: 1 }).success).toBe(false);
    expect(academyStructureKey("account-a", "academy-a")).not.toEqual(academyStructureKey("account-b", "academy-a"));
    for (const key of offeringAffectedKeys("account-a", "academy-a")) expect(key).toContain("academy-a");
  });
});
