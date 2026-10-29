import { expect, it } from "vitest";
import { commandEntries, filteredCommands } from "./catalog";
it("only offers commands permitted by the existing role manifest", () => {
  expect(commandEntries("staff", "academy", "instructor").some(item => item.title === "Notifications")).toBe(false);
  expect(commandEntries("staff", "academy", "admin").some(item => item.title === "Notifications")).toBe(true);
});
it("does not offer academy mutations without academy context", () => {
  expect(commandEntries("staff", undefined, null).map(item => item.title)).toEqual(["Account"]);
});
it("uses real creation forms and matches commands as well as pages", () => {
  const matches = filteredCommands(commandEntries("staff", "academy", "admin"), "assignment");
  expect(matches.some(item => item.group === "Actions" && item.href.endsWith("/academy/assignments/new"))).toBe(true);
  expect(matches.some(item => item.group === "Pages" && item.href.endsWith("/academy/assessments"))).toBe(true);
  for (const [query, path] of [["quiz", "/academy/quizzes/new"], ["exam", "/academy/exams/new"]]) {
    const found = filteredCommands(commandEntries("staff", "academy", "instructor"), query);
    expect(found.some(item => item.group === "Actions" && item.href.endsWith(path))).toBe(true);
    expect(found.some(item => item.group === "Pages" && item.href.endsWith("/academy/assessments"))).toBe(true);
  }
  // The separate staff list pages are gone; Assessments is the one destination.
  expect(commandEntries("staff", "academy", "admin").filter(item => item.group === "Pages" && /\/academy\/(assignments|quizzes|exams)$/.test(item.href))).toEqual([]);
});
it("opens the groups panel on the Students page for the Groups command", () => {
  const groups = commandEntries("staff", "academy", "admin").find(item => item.title === "Groups");
  expect(groups?.href.endsWith("/academy/students?groups=open")).toBe(true);
});
it("keeps student search navigation separate from staff commands", () => {
  const entries = commandEntries("student", "academy", null);
  // Student lists are shared across academies; search never opens an academy-scoped copy.
  expect(entries.some(item => item.href.endsWith("/assignments") && !item.href.includes("/academy/"))).toBe(true);
  expect(entries.some(item => item.group === "Actions")).toBe(false);
});
it("ranks exact command matches above incidental keywords and tolerates a small typo", () => {
  const entries = commandEntries("staff", "academy", "admin");
  expect(filteredCommands(entries, "attendance")[0].title).toBe("Attendance");
  expect(filteredCommands(entries, "start sesion")[0].command).toBe("start-session");
  expect(filteredCommands(entries, "بدء حصة")[0].command).toBe("start-session");
});
