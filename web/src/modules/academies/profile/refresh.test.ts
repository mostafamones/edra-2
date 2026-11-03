import { expect, it, vi } from "vitest";
import { refreshProfileShell } from "./refresh";

it("keeps a committed save successful when shell refresh throws or rejects", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await expect(refreshProfileShell(() => { throw new Error("failed"); })).resolves.toBeUndefined();
    await expect(refreshProfileShell(() => Promise.reject(new Error("failed")))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
  }
});
