import { describe, expect, it } from "vitest";

import {
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
    for (const href of ["/app/groups", "/app/groups/new", "/app/schedules", "/app/schedules/new", "/app/attendance", "/app/attendance/new", "/app/students", "/app/students/new"]) {
      expect(findStaffItem(href)?.preview).toBeUndefined();
    }
  });

  it("keeps restricted staff sections out of Instructor navigation", () => {
    for (const href of ["/app/manage/access", "/app/manage/bookings/review", "/app/manage/notifications", "/app/manage/integrations"]) {
      const item = findStaffItem(href);
      expect(item).toBeDefined();
      expect(canViewStaffItem(item!, "instructor")).toBe(false);
      expect(canViewStaffItem(item!, "owner")).toBe(true);
    }
  });
});
