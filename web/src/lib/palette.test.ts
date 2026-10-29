import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isPaletteKey, PALETTE_KEYS } from "./palette";

describe("palette", () => {
  it("matches the database allowlist of the newest migration that defines it", () => {
    const dir = join(__dirname, "../../supabase/migrations");
    const sql = readdirSync(dir).filter((file) => /^\d+_.*\.sql$/.test(file)).sort()
      .map((file) => readFileSync(join(dir, file), "utf8")).filter((text) => text.includes("labels_color_check")).at(-1);
    const keys = /labels_color_check check \(color in \(([^)]*)\)\)/.exec(sql ?? "")?.[1].match(/'([a-z]+)'/g)?.map((key) => key.slice(1, -1));
    expect(keys).toEqual(PALETTE_KEYS);
  });

  it("recognizes only its own keys", () => {
    expect(isPaletteKey("teal")).toBe(true);
    expect(isPaletteKey("toString")).toBe(false);
    expect(isPaletteKey("#ff0000")).toBe(false);
  });
});
