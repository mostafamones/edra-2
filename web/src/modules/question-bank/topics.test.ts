import { expect, it } from "vitest";
import type { Question } from "./parser";
import { changeTopics, groupTopics, maxTopics } from "./topics";

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
  const edited = groupTopics([a, b, c, d], {
    a: changeTopics(a, undefined, { type: "move", from: "Linked lists", to: "Queues" }),
    b: changeTopics(b, undefined, { type: "clear" }),
    d: changeTopics(d, undefined, { type: "move", from: "Algebra", to: "Queues" }),
  });
  expect(edited.assignments.get("a")).toEqual([{ label: "Queues", verification: "confirmed" }]);
  expect(edited.assignments.has("b")).toBe(false);
  expect(edited.groups[0].questions.map(q => q.section)).toEqual(["Part A", "Algebra"]);
});

it("confirms several topics on one question without duplicating it in the save grouping", () => {
  const a = question("a", "Part A", "Algebra");
  let edit = changeTopics(a, undefined, { type: "confirm", label: "Algebra" });
  edit = changeTopics(a, edit, { type: "confirm", label: "Equations" });
  edit = changeTopics(a, edit, { type: "confirm", label: " equations " });
  const { groups, primary, assignments } = groupTopics([a], { a: edit });
  expect(assignments.get("a")).toEqual([{ label: "Algebra", verification: "confirmed" }, { label: "Equations", verification: "confirmed" }]);
  expect(groups.map(group => group.label)).toEqual(["Algebra", "Equations"]);
  expect(primary.flatMap(group => group.questions.map(q => q.id))).toEqual(["a"]);
  const removed = changeTopics(a, edit, { type: "remove", label: "Algebra" });
  expect(groupTopics([a], { a: removed }).assignments.get("a")).toEqual([{ label: "Equations", verification: "confirmed" }]);
  let many = edit;
  for (let i = 0; i < 20; i++) many = changeTopics(a, many, { type: "confirm", label: `Topic ${i}` });
  expect(many.confirmed).toHaveLength(maxTopics);
});
