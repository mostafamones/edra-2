import { describe, expect, it } from "vitest";

import { settingsFieldErrors, studentCodeSettingsInputSchema } from "./validation";

const base = {
  academyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expectedVersion: 0,
  enabled: true,
  defaultPattern: "####",
  levels: [{ levelId: "secondary-1", pattern: "ST2###" }],
};

function errors(value: unknown) {
  const parsed = studentCodeSettingsInputSchema.safeParse(value);
  return parsed.success ? {} : settingsFieldErrors(parsed.error);
}

describe("studentCodeSettingsInputSchema", () => {
  it("accepts a default with overrides", () => {
    expect(studentCodeSettingsInputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts codes turned on before any format exists", () => {
    expect(errors({ ...base, defaultPattern: " ", levels: [] })).toEqual({});
    expect(errors({ ...base, defaultPattern: " " })).toEqual({});
    expect(errors({ ...base, enabled: false, defaultPattern: "", levels: [] })).toEqual({});
  });

  it("points at the failing field", () => {
    expect(errors({ ...base, defaultPattern: "#ST#" })).toEqual({ defaultPattern: expect.stringContaining("together at the end") });
    expect(errors({ ...base, levels: [{ levelId: "secondary-1", pattern: "ST 2##" }] })).toHaveProperty(["level:secondary-1"]);
    expect(errors({ ...base, levels: [{ levelId: "secondary-1", pattern: "A#" }, { levelId: "secondary-1", pattern: "B#" }] }))
      .toHaveProperty(["level:secondary-1"]);
  });

  it("rejects a negative expected version and a foreign academy id shape", () => {
    expect(studentCodeSettingsInputSchema.safeParse({ ...base, expectedVersion: -1 }).success).toBe(false);
    expect(studentCodeSettingsInputSchema.safeParse({ ...base, academyId: "academy" }).success).toBe(false);
  });
});
