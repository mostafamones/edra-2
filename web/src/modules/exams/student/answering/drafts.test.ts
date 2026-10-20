import { describe, expect, it } from "vitest";
import { acknowledge, createDrafts, current, edit, isAnswered, nextCommand, reconcile, resolve } from "./drafts";

const text = (value: string | null) => ({ choiceId: null, text: value });
describe("answer reconciliation", () => {
  it("retains later edits on acknowledgment and records their new baseline", () => {
    const first = edit(createDrafts({}, 0), "q", text("one"));
    const sent = nextCommand(first, [{ id: "q", kind: "written_work" }], () => true, "key", 1)!;
    const later = edit(sent.model, "q", text("two"));
    const ack = acknowledge(later, 1);
    expect(current(ack, "q")).toEqual(text("two"));
    expect(ack.drafts.q.baseline).toEqual(text("one"));
    expect(sent.command.answers).toEqual([{ questionId: "q", text: "one" }]);
  });
  it("rebases only unchanged acknowledged baselines and allows explicit conflict resolution", () => {
    const edited = edit(createDrafts({ q: text("base") }, 1), "q", text("mine"));
    expect(reconcile(edited, { q: text("base") }, 2).conflicts).toEqual({});
    const conflict = reconcile(edited, { q: text("new") }, 2);
    expect(conflict.conflicts.q).toEqual(text("new"));
    expect(resolve(conflict, "q", "saved").drafts).toEqual({});
    expect(resolve(conflict, "q", "mine").drafts.q.baseline).toEqual(text("new"));
  });
  it("limits batches to 300, skips excluded questions, and normalizes whitespace", () => {
    let model = createDrafts({}, 0);
    const questions = Array.from({ length: 302 }, (_, n) => ({ id: `q${n}`, kind: "written_work" as const }));
    for (const question of questions) model = edit(model, question.id, text("   "));
    const batch = nextCommand(model, questions, (id) => id !== "q0", "key", 1)!;
    expect(batch.command.answers).toHaveLength(300);
    expect(batch.command.answers[0]).toEqual({ questionId: "q1", text: null });
    expect(isAnswered(text(" \n "))).toBe(false);
    expect(isAnswered(text("answer"))).toBe(true);
  });
});
