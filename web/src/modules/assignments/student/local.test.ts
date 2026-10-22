// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { clearLocalDraft, conflictsAgainst, editorToken, loadLocalDraft, purgeAssignmentDrafts, reconcile, storeLocalDraft } from "./local";

const draft = { generation: 2, baseVersion: 3, pending: { q: "c" }, conflicts: {}, operation: null };

describe("assignment local drafts", () => {
  it("round-trips per account and record, and clears", () => {
    expect(storeLocalDraft("user-a", "record", "assignment", draft)).toBe(true);
    expect(loadLocalDraft("user-a", "record", "assignment")).toEqual(draft);
    expect(loadLocalDraft("user-b", "record", "assignment")).toBeNull();
    expect(loadLocalDraft("user-a", "other-record", "assignment")).toBeNull();
    clearLocalDraft("user-a", "record", "assignment");
    expect(loadLocalDraft("user-a", "record", "assignment")).toBeNull();
  });
  it("purges other accounts' drafts and tokens", () => {
    storeLocalDraft("user-a", "record", "assignment", draft);
    storeLocalDraft("user-b", "record", "assignment", draft);
    const token = editorToken("user-a", "assignment");
    expect(editorToken("user-a", "assignment")).toBe(token);
    purgeAssignmentDrafts("user-b");
    expect(loadLocalDraft("user-a", "record", "assignment")).toBeNull();
    expect(loadLocalDraft("user-b", "record", "assignment")).toEqual(draft);
    expect(editorToken("user-a", "assignment")).not.toBe(token);
    purgeAssignmentDrafts(null);
    expect(loadLocalDraft("user-b", "record", "assignment")).toBeNull();
  });
  it("resumes only the same generation at the acknowledged version", () => {
    expect(reconcile(draft, { generation: 2, version: 3, answers: {} })).toEqual({ kind: "resume", draft });
    const lost = { ...draft, operation: { kind: "save" as const, payload: {} } };
    expect(reconcile(lost, { generation: 2, version: 4, answers: { q: "c" } }).kind).toBe("resume");
    expect(reconcile(null, { generation: 1, version: 0, answers: {} })).toEqual({ kind: "none" });
  });
  it("turns differing choices into conflicts instead of replaying them", () => {
    expect(reconcile(draft, { generation: 3, version: 3, answers: { q: "b" } })).toEqual({ kind: "conflicts", conflicts: { q: "c" } });
    expect(reconcile(draft, { generation: 2, version: 5, answers: {} })).toEqual({ kind: "conflicts", conflicts: { q: "c" } });
    expect(reconcile(draft, { generation: 3, version: 3, answers: { q: "c" } })).toEqual({ kind: "none" });
    expect(conflictsAgainst({ a: null, b: "x" }, { b: "y" })).toEqual({ b: "x" });
  });
});
