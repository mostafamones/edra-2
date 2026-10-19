import { describe, expect, it } from "vitest";
import { academySwitchHref } from "./switch-destination";
import { internalStaffPath, internalStudentPath, publicHref } from "../../lib/routing";

describe("canonical navigation", () => {
  it("keeps manifest identities independent from public staff paths", () => {
    expect(internalStaffPath("/science/students", "science")).toBe("/app/students");
    expect(publicHref("/app/students/new", "science")).toBe("http://app.lvh.me:3000/science/students/new");
    expect(internalStudentPath("/profile")).toBe("/learn/profile");
    expect(publicHref("/learn/profile")).toBe("http://learn.lvh.me:3000/profile");
  });
  it("renders personal account inside the academy layout", () => {
    expect(publicHref("/app/manage/account", "science")).toBe("http://app.lvh.me:3000/science/manage/account");
    expect(academySwitchHref("/science/manage/account", "science", { slug: "math", role: "admin" })).toBe("http://app.lvh.me:3000/math/manage/account");
  });
  it("switches the academy while discarding record IDs and query filters", () => {
    expect(academySwitchHref("/science/schedules/private-id/edit?group=source", "science", { slug: "math", role: "admin" })).toBe("http://app.lvh.me:3000/math/schedules");
    expect(academySwitchHref("/science/students/import?session=source", "science", { slug: "math", role: "admin" })).toBe("http://app.lvh.me:3000/math/students");
  });
  it("falls back to home for unavailable and unauthorized sections", () => {
    expect(academySwitchHref("/science/manage/access", "science", { slug: "math", role: "instructor" })).toBe("http://app.lvh.me:3000/math");
    expect(academySwitchHref("/science/unknown/record", "science", { slug: "math", role: "owner" })).toBe("http://app.lvh.me:3000/math");
  });
});
