import { describe, expect, it } from "vitest";

import { assignmentPermissions } from "./permissions";

const at = (state: "draft" | "published" | "closed" | "archived", extra: { yearOpen?: boolean; hasActivity?: boolean } = {}) =>
  ({ state, yearOpen: extra.yearOpen ?? true, hasActivity: extra.hasActivity ?? false });

describe("assignment permissions", () => {
  it("lets every staff role prepare drafts", () => {
    for (const role of ["owner", "admin", "instructor"] as const) {
      expect(assignmentPermissions(role, at("draft"))).toMatchObject({ edit: true, editStructure: true });
    }
  });

  it("keeps publication and lifecycle with Owner/Admin", () => {
    expect(assignmentPermissions("instructor", at("draft"))).toMatchObject({ publish: false, archive: false });
    expect(assignmentPermissions("instructor", at("published"))).toEqual({
      edit: false, editStructure: false, publish: false, unpublish: false, close: false, reopen: false, archive: false, mark: true,
    });
    expect(assignmentPermissions("admin", at("draft"))).toMatchObject({ publish: true, archive: true });
    expect(assignmentPermissions("owner", at("published"))).toMatchObject({ edit: true, editStructure: false, unpublish: true, close: true, archive: false });
    expect(assignmentPermissions("owner", at("closed"))).toMatchObject({ reopen: true, archive: true, close: false });
  });

  it("lets every staff role mark and publish results once the assignment is published", () => {
    for (const role of ["owner", "admin", "instructor"] as const) {
      expect(assignmentPermissions(role, at("published")).mark).toBe(true);
      expect(assignmentPermissions(role, at("closed")).mark).toBe(true);
      expect(assignmentPermissions(role, at("draft")).mark).toBe(false);
    }
  });

  it("blocks unpublishing once students have activity", () => {
    expect(assignmentPermissions("owner", at("published", { hasActivity: true })).unpublish).toBe(false);
  });

  it("makes archived assignments and closed years read-only", () => {
    expect(Object.values(assignmentPermissions("owner", at("archived"))).some(Boolean)).toBe(false);
    expect(Object.values(assignmentPermissions("owner", at("draft", { yearOpen: false }))).some(Boolean)).toBe(false);
  });
});
