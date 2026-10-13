import { describe, expect, it } from "vitest";

import {
  canArchiveStudentRecords, canChangeStudentGroups, canCreateStudentRecord, canEditStudentContact, canEditStudentPlacement,
  canImportStudents,
} from "./permissions";

describe("student record permissions", () => {
  it("lets owners, head admins and admins do everything in this slice", () => {
    for (const role of ["owner", "head_admin", "admin"] as const) {
      expect(canCreateStudentRecord(role)).toBe(true);
      expect(canEditStudentContact(role)).toBe(true);
      expect(canEditStudentPlacement(role)).toBe(true);
      expect(canArchiveStudentRecords(role)).toBe(true);
      expect(canImportStudents(role)).toBe(true);
      expect(canChangeStudentGroups(role)).toBe(true);
    }
  });

  it("limits instructors to creating records and editing contact details", () => {
    expect(canCreateStudentRecord("instructor")).toBe(true);
    expect(canEditStudentContact("instructor")).toBe(true);
    expect(canEditStudentPlacement("instructor")).toBe(false);
    expect(canArchiveStudentRecords("instructor")).toBe(false);
    expect(canImportStudents("instructor")).toBe(false);
    expect(canChangeStudentGroups("instructor")).toBe(false);
  });
});
