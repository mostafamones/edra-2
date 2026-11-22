import { expect, it } from "vitest";
import type { Question } from "./parser";
import { sectionRuns } from "./sections";

const q = (id: string, page: number, section: string | null): Question => ({ id, section, number: id, page, prompt: "Solve.", choices: [], issues: [] });

it("keeps repeated headings distinct by their starting page and marks only a range-opening run as a continuation", () => {
  const questions = [q("a", 5, "Exercises"), q("b", 5, null), q("c", 6, " exercises "), q("d", 7, "Review"), q("e", 9, "Exercises")];
  const runs = sectionRuns(questions, { first: 5, last: 9 });
  expect(runs.get("a")).toEqual({ name: "Exercises", firstPage: 5, continues: true });
  expect(runs.has("b")).toBe(false);
  expect(runs.get("c")).toEqual(runs.get("a"));
  expect(runs.get("d")).toEqual({ name: "Review", firstPage: 7, continues: false });
  expect(runs.get("e")).toEqual({ name: "Exercises", firstPage: 9, continues: false });
  expect(sectionRuns(questions, { first: 1, last: 9 }).get("a")?.continues).toBe(false);
  expect(sectionRuns([q("x", 6, "Exercises")], { first: 5, last: 9 }).get("x")?.continues).toBe(false);
});
