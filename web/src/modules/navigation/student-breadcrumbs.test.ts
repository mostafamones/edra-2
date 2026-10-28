import { describe, expect, it } from "vitest";
import { studentBreadcrumbs } from "./student-breadcrumbs";

const academies = [{ slug: "coding-heaven", name: "Coding Heaven" }];

describe("student breadcrumbs", () => {
  it("resolves global pages without treating them as academies", () => {
    expect(studentBreadcrumbs("/", academies)).toEqual([{ label: "Home" }]);
    expect(studentBreadcrumbs("/courses", academies)).toEqual([{ label: "Home", href: "/" }, { label: "My courses" }]);
    expect(studentBreadcrumbs("/learn/profile", academies)).toEqual([{ label: "Home", href: "/" }, { label: "Account" }]);
  });

  it("links academy details to the shared lists for public and internal paths", () => {
    const home = { label: "Home", href: "/" };
    const academy = { label: "Coding Heaven", href: "/coding-heaven" };
    expect(studentBreadcrumbs("/coding-heaven", academies)).toEqual([home, { label: "Coding Heaven" }]);
    expect(studentBreadcrumbs("/coding-heaven/courses", academies)).toEqual([home, academy, { label: "My courses" }]);
    expect(studentBreadcrumbs("/learn/academy/coding-heaven/assignments/123", academies)).toEqual([home, academy, { label: "Assignments", href: "/assignments" }, { label: "Assignment" }]);
    expect(studentBreadcrumbs("/coding-heaven/exams/123", academies)).toEqual([home, academy, { label: "Exams", href: "/exams" }, { label: "Exam" }]);
    expect(studentBreadcrumbs("/coding-heaven/units/123", academies)).toEqual([home, academy, { label: "My courses", href: "/courses" }, { label: "Course" }]);
  });
});
