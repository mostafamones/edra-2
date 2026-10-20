import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireEditorLock } from "./ownership";

afterEach(() => vi.unstubAllGlobals());
describe("same-origin editor guard", () => {
  it("keeps duplicate documents out until the original releases its lock", async () => {
    let held = false;
    vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, run: (lock: object | null) => Promise<void> | undefined) => {
      if (held) return run(null);
      held = true;
      await run({});
      held = false;
    } } });
    const original = await acquireEditorLock("exam");
    expect(original.status).toBe("held");
    expect((await acquireEditorLock("exam")).status).toBe("taken");
    if (original.status === "held") original.release();
    await Promise.resolve();
    const recovered = await acquireEditorLock("exam");
    expect(recovered.status).toBe("held");
    if (recovered.status === "held") recovered.release();
  });
  it("reports unsupported platforms so entry cannot reuse a copied token", async () => {
    vi.stubGlobal("navigator", {});
    expect(await acquireEditorLock("exam")).toEqual({ status: "unsupported" });
  });
});
