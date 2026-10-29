import { describe, expect, it } from "vitest";

import {
  ASSESSMENT_PATHS,
  STAFF_CREATE_ITEMS,
  STAFF_WORKSPACE_SECTIONS,
  allStaffItems,
  allStudentItems,
  canViewStaffItem,
  findStaffItem,
  findStudentItem,
} from "./manifest";

describe("portal navigation manifest", () => {
  it("gives every staff and student destination a distinct route and validates previews when present", () => {
    for (const [prefix, items] of [["/app", allStaffItems()], ["/learn", allStudentItems()]] as const) {
      const paths = items.map((item) => item.href);
      expect(new Set(paths).size).toBe(paths.length);
      for (const item of items) {
        expect(item.href === prefix || item.href.startsWith(`${prefix}/`)).toBe(true);
        if (item.preview) {
          expect(item.preview.title.length).toBeGreaterThan(0);
          expect(item.preview.purpose.length).toBeGreaterThan(0);
          expect(item.preview.sections.length).toBeGreaterThanOrEqual(3);
        }
        expect(prefix === "/app" ? findStaffItem(item.href) : findStudentItem(item.href)).toBe(item);
      }
    }
    for (const href of ["/app/students?groups=open", "/app/schedules", "/app/schedules/new", "/app/attendance", "/app/attendance/new", "/app/students", "/app/students/new", "/app/manage/bookings"]) {
      expect(findStaffItem(href)?.preview).toBeUndefined();
    }
  });

  it("keeps restricted staff sections out of Instructor navigation", () => {
    for (const href of ["/app/manage/access", "/app/manage/notifications", "/app/manage/integrations"]) {
      const item = findStaffItem(href);
      expect(item).toBeDefined();
      expect(canViewStaffItem(item!, "instructor")).toBe(false);
      expect(canViewStaffItem(item!, "owner")).toBe(true);
      expect(canViewStaffItem(item!, "head_admin")).toBe(true);
      expect(canViewStaffItem(item!, "admin")).toBe(true);
    }
  });

  it("gives staff one Assessments destination and keeps student work pages separate", () => {
    expect(findStaffItem("/app/assessments")?.label).toBe("Assessments");
    for (const href of ["/app/assignments", "/app/quizzes", "/app/exams"]) expect(findStaffItem(href)).toBeUndefined();
    expect(STAFF_WORKSPACE_SECTIONS.some((section) => section.label === "Assessments")).toBe(false);
    expect(ASSESSMENT_PATHS).toEqual(["/app/assessments", "/app/assignments", "/app/quizzes", "/app/exams"]);
    expect(STAFF_CREATE_ITEMS.filter((item) => ["assignments", "quizzes", "exams"].includes(item.icon)).map((item) => item.href))
      .toEqual(["/app/assignments/new", "/app/quizzes/new", "/app/exams/new"]);
    for (const href of ["/learn/assignments", "/learn/quizzes", "/learn/exams"]) expect(findStudentItem(href)).toBeDefined();
  });
});
