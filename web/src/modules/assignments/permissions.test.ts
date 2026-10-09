import { describe, expect, it } from "vitest";

import { assignmentPermissions } from "./permissions";

const at = (state: "active" | "closed" | "archived", extra: { yearOpen?: boolean; hasActivity?: boolean; ready?: boolean } = {}) =>
  ({ state, yearOpen: extra.yearOpen ?? true, hasActivity: extra.hasActivity ?? false, ready: extra.ready ?? true });

describe("assignmentPermissions", () => {
  it("lets every staff role edit the whole setup until marking starts", () => {
    for (const role of ["owner", "admin", "instructor"] as const) {
      expect(assignmentPermissions(role, at("active"))).toMatchObject({ edit: true, editStructure: true });
    }
  });

  it("freezes the structure once marking starts and leaves text edits to Owner/Admin", () => {
    expect(assignmentPermissions("instructor", at("active", { hasActivity: true }))).toEqual({
      edit: false, editStructure: false, close: false, reopen: false, archive: false, mark: true,
    });
    expect(assignmentPermissions("owner", at("active", { hasActivity: true }))).toMatchObject({ edit: true, editStructure: false, close: true, archive: false });
    expect(assignmentPermissions("admin", at("closed"))).toMatchObject({ edit: true, editStructure: false, reopen: true, archive: true });
  });

  it("keeps lifecycle actions for Owner/Admin", () => {
    expect(assignmentPermissions("instructor", at("active"))).toMatchObject({ close: false, archive: false });
    expect(assignmentPermissions("admin", at("active"))).toMatchObject({ close: true, archive: true, reopen: false });
  });

  it("lets every staff role mark and announce results without publishing, once every part is complete", () => {
    for (const role of ["owner", "admin", "instructor"] as const) {
      expect(assignmentPermissions(role, at("active")).mark).toBe(true);
      expect(assignmentPermissions(role, at("closed")).mark).toBe(true);
      expect(assignmentPermissions(role, at("active", { ready: false })).mark).toBe(false);
    }
  });

  it("makes archived assignments and closed years read-only", () => {
    expect(Object.values(assignmentPermissions("owner", at("archived"))).some(Boolean)).toBe(false);
    expect(Object.values(assignmentPermissions("owner", at("active", { yearOpen: false }))).some(Boolean)).toBe(false);
  });
});
