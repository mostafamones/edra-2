import { describe, expect, it } from "vitest";

import { canManageMember, canViewInvitations, invitableRoles, roleChoices } from "./permissions";

describe("staff invitation permissions", () => {
  it("follows the permission matrix", () => {
    expect(invitableRoles("owner")).toEqual(["head_admin", "admin", "instructor"]);
    expect(invitableRoles("head_admin")).toEqual(["admin", "instructor"]);
    expect(invitableRoles("admin")).toEqual(["instructor"]);
    expect(invitableRoles("instructor")).toEqual([]);
    expect(canViewInvitations("owner")).toBe(true);
    expect(canViewInvitations("head_admin")).toBe(true);
    expect(canViewInvitations("admin")).toBe(true);
    expect(canViewInvitations("instructor")).toBe(false);
  });
});

describe("member management", () => {
  it("never manages the Owner or yourself", () => {
    expect(canManageMember("owner", "owner", "a", "b")).toBe(false);
    expect(canManageMember("head_admin", "owner", "a", "b")).toBe(false);
    expect(canManageMember("owner", "admin", "a", "a")).toBe(false);
    expect(roleChoices("owner", "head_admin", "a", "a")).toEqual([]);
  });

  it("keeps Head Admins under the Owner alone", () => {
    expect(canManageMember("owner", "head_admin", "a", "b")).toBe(true);
    expect(canManageMember("head_admin", "head_admin", "a", "b")).toBe(false);
    expect(canManageMember("admin", "head_admin", "a", "b")).toBe(false);
    expect(roleChoices("owner", "head_admin", "a", "b")).toEqual(["admin", "instructor"]);
    expect(roleChoices("head_admin", "head_admin", "a", "b")).toEqual([]);
  });

  it("lets a Head Admin manage Admins and Instructors without appointing Head Admins", () => {
    expect(canManageMember("head_admin", "admin", "a", "b")).toBe(true);
    expect(roleChoices("head_admin", "admin", "a", "b")).toEqual(["instructor"]);
    expect(roleChoices("head_admin", "instructor", "a", "b")).toEqual(["admin"]);
  });

  it("limits an Admin to Instructors and gives no role changes", () => {
    expect(canManageMember("admin", "instructor", "a", "b")).toBe(true);
    expect(canManageMember("admin", "admin", "a", "b")).toBe(false);
    expect(roleChoices("admin", "instructor", "a", "b")).toEqual([]);
  });

  it("gives Instructors no staff management", () => {
    expect(canManageMember("instructor", "instructor", "a", "b")).toBe(false);
    expect(roleChoices("instructor", "instructor", "a", "b")).toEqual([]);
  });
});
