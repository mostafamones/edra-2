import { describe, expect, it } from "vitest";

import { canViewInvitations, invitableRoles } from "./permissions";

describe("staff invitation permissions", () => {
  it("follows the permission matrix", () => {
    expect(invitableRoles("owner")).toEqual(["admin", "instructor"]);
    expect(invitableRoles("admin")).toEqual(["instructor"]);
    expect(invitableRoles("instructor")).toEqual([]);
    expect(canViewInvitations("owner")).toBe(true);
    expect(canViewInvitations("admin")).toBe(true);
    expect(canViewInvitations("instructor")).toBe(false);
  });
});
