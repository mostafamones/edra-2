// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { clearLocalDraft, editorToken, loadLocalDraft, purgeAssignmentDrafts, reconcile, storeLocalDraft } from "./local";

const draft = { generation: 2, baseVersion: 3, pending: { q: "c" }, operation: null };

describe("assignment local drafts", () => {
  it("round-trips per account and clears", () => {
    expect(storeLocalDraft("user-a", "assignment", draft)).toBe(true);
    expect(loadLocalDraft("user-a", "assignment")).toEqual(draft);
    expect(loadLocalDraft("user-b", "assignment")).toBeNull();
    clearLocalDraft("user-a", "assignment");
    expect(loadLocalDraft("user-a", "assignment")).toBeNull();
  });
  it("purges other accounts' drafts and tokens", () => {
    storeLocalDraft("user-a", "assignment", draft);
    storeLocalDraft("user-b", "assignment", draft);
    const token = editorToken("user-a", "assignment");
    expect(editorToken("user-a", "assignment")).toBe(token);
    purgeAssignmentDrafts("user-b");
    expect(loadLocalDraft("user-a", "assignment")).toBeNull();
    expect(loadLocalDraft("user-b", "assignment")).toEqual(draft);
    expect(editorToken("user-a", "assignment")).not.toBe(token);
    purgeAssignmentDrafts(null);
    expect(loadLocalDraft("user-b", "assignment")).toBeNull();
  });
  it("never replays pending work over newer server work or another generation", () => {
    expect(reconcile(draft, { generation: 2, version: 3 })).toBe("resume");
    expect(reconcile(draft, { generation: 2, version: 4 })).toBe("discard");
    expect(reconcile(draft, { generation: 3, version: 3 })).toBe("discard");
    expect(reconcile(null, { generation: 1, version: 0 })).toBe("none");
    expect(reconcile({ ...draft, operation: { kind: "save", payload: {} } }, { generation: 2, version: 4 })).toBe("resume");
  });
});
