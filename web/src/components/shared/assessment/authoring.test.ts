import { describe, expect, it } from "vitest";
import { adoptStoredIds, identifyDraft } from "./authoring";

describe("authoring persistent identity", () => {
  it("adopts IDs into edited/reordered entries without assigning an ID to a different new entry", () => {
    const submitted = identifyDraft({ parts: [{ title: "A", questions: [{ prompt: "one", choices: [{ label: "a" }] }] }, { title: "B", questions: [] }] });
    const stored = { parts: [{ id: "part-a", title: "A", questions: [{ id: "q-one", prompt: "one", choices: [{ id: "choice-a", label: "a" }] }] }, { id: "part-b", title: "B", questions: [] }] };
    const current = { parts: [submitted.parts[1], { ...submitted.parts[0], title: "New title" }, ...identifyDraft([{ title: "New part", questions: [] }])] };
    const next = adoptStoredIds(submitted, stored, current);
    expect(next.parts.map((p) => (p as { id?: string }).id)).toEqual(["part-b", "part-a", undefined]);
    expect(next.parts[1]).toMatchObject({ title: "New title", questions: [{ id: "q-one", choices: [{ id: "choice-a" }] }] });
  });
});
