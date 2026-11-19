import { expect, it } from "vitest";
import type { Question } from "./parser";
import { groupTopics } from "./topics";

const question = (id: string, section: string, topic?: string | null): Question => ({
  id, section, topic, number: "1", page: 1, prompt: "Find the result.", choices: [], issues: [],
});

it("groups consistent labels across pages, keeps source sections, and honors an explicit move or removal", () => {
  const a = question("a", "Part A", "Linked lists");
  const b = question("b", "Part B", " linked  lists ");
  const c = question("c", "Multiple choice");
  const d = question("d", "Algebra");
  const initial = groupTopics([a, b, c, d], {});
  expect(initial.groups.map(group => [group.label, group.questions.length, group.pending])).toEqual([
    ["Algebra", 1, 1], ["Linked lists", 2, 2], [null, 1, 0],
  ]);
  const edited = groupTopics([a, b, c, d], { a: "Queues", b: null, d: "Queues" });
  expect(edited.assignments.get("a")).toEqual({ label: "Queues", verification: "confirmed" });
  expect(edited.assignments.has("b")).toBe(false);
  expect(edited.groups[0].questions.map(q => q.section)).toEqual(["Part A", "Algebra"]);
});
