import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { newRequestKey } from "./request-key";

describe("newRequestKey", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to a valid UUID where randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const key = newRequestKey();
    expect(z.uuid().safeParse(key).success).toBe(true);
    expect(newRequestKey()).not.toBe(key);
  });
});
