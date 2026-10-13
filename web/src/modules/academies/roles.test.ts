import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACADEMY_ROLE_LABELS, ACADEMY_ROLES, academyRoleRank, academyRoleSchema, isAcademyManager, isAcademyRole } from "./roles";

describe("academy role contract", () => {
  it("accepts the four staff roles and rejects anything else", () => {
    for (const role of ["owner", "head_admin", "admin", "instructor"]) expect(isAcademyRole(role)).toBe(true);
    for (const role of ["student", "head-admin", "Head Admin", "", null, undefined]) expect(isAcademyRole(role)).toBe(false);
    expect(academyRoleSchema.safeParse("suspended").success).toBe(false);
  });

  it("labels and ranks Owner first", () => {
    expect(ACADEMY_ROLE_LABELS.head_admin).toBe("Head Admin");
    expect([...ACADEMY_ROLES].sort((a, b) => academyRoleRank(a) - academyRoleRank(b)))
      .toEqual(["owner", "head_admin", "admin", "instructor"]);
  });

  it("treats Head Admin as an ordinary manager and Instructor as not", () => {
    expect(isAcademyManager("owner")).toBe(true);
    expect(isAcademyManager("head_admin")).toBe(true);
    expect(isAcademyManager("admin")).toBe(true);
    expect(isAcademyManager("instructor")).toBe(false);
  });

  it("matches the role enum published in the bearer API contract", () => {
    const spec = readFileSync(join(__dirname, "../../../docs/api/sessions-attendance.openapi.yaml"), "utf8");
    const match = spec.match(/role: \{ type: string, enum: \[([^\]]+)\] \}/);
    expect(match?.[1].split(",").map((value) => value.trim())).toEqual([...ACADEMY_ROLES]);
  });
});
