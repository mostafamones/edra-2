// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ rows: new Map<string, unknown>() }));
vi.mock("./journal", () => ({
  indexedDbJournal: {},
  purgeJournals: async (_store: unknown, accountId: string | null) => {
    for (const key of storage.rows.keys()) if (!accountId || !key.startsWith(accountId + ":")) storage.rows.delete(key);
  },
}));
import { installExamSignOutCleanup, onExamAccountChange, setExamJournalAccount } from "./cleanup";

afterEach(() => { storage.rows.clear(); document.body.innerHTML = ""; vi.restoreAllMocks(); });
describe("cleanup outside the exam mount", () => {
  it("clears pending data before a native POST sign-out leaves the document", async () => {
    await setExamJournalAccount("account-a");
    storage.rows.set("account-a:attempt", { pending: "answer" });
    sessionStorage.setItem("edra:exam-editor:exam", "token");
    const stop = vi.fn(); const unsubscribe = onExamAccountChange(stop);
    const nativeSubmit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function () {
      expect(storage.rows.size).toBe(0);
    });
    const remove = installExamSignOutCleanup();
    document.body.innerHTML = '<form action="/auth/signout" method="post"></form>';
    const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
    document.querySelector("form")!.dispatchEvent(event);
    await setExamJournalAccount(null);
    await Promise.resolve();
    expect(event.defaultPrevented).toBe(true); expect(nativeSubmit).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("edra:exam-editor:exam")).toBeNull();
    remove(); unsubscribe();
  });
  it("purges the previous account while preserving the current account's pending answers", async () => {
    storage.rows.set("account-a:attempt", {}); storage.rows.set("account-b:attempt", {});
    await setExamJournalAccount("account-b");
    expect([...storage.rows.keys()]).toEqual(["account-b:attempt"]);
  });
});
