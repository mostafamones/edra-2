import { describe, expect, it } from "vitest";

import { throughTransport } from "./transport.test-support";

describe("server-function transport", () => {
  it("keeps plain results, Dates, undefined and Maps", async () => {
    const value = { ok: true, at: new Date(0), gone: undefined, rows: [{ id: "a" }], map: new Map([["a", 1]]) };
    expect(await throughTransport(value)).toEqual(value);
  });

  it("rejects values that have no safe wire form", async () => {
    class Row { id = "a"; }
    await expect(throughTransport({ row: new Row() })).rejects.toThrow();
    await expect(throughTransport({ run: () => 1 })).rejects.toThrow();
  });

  it("carries only a thrown Error's message, so messages must stay redacted and callers cannot read custom fields", async () => {
    const { error } = await throughTransport({ error: Object.assign(new Error("secret"), { details: "private" }) });
    expect(error.message).toBe("secret");
    expect(error).not.toHaveProperty("details");
  });
});
