import { describe, expect, it } from "vitest";

import { settingsFieldErrors, studentCodeSettingsInputSchema } from "./validation";

const base = {
  academyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expectedVersion: 0,
  enabled: true,
  defaultPattern: "####",
  levels: [{ levelId: "grade-10", pattern: "ST2###" }],
};

function errors(value: unknown) {
  const parsed = studentCodeSettingsInputSchema.safeParse(value);
  return parsed.success ? {} : settingsFieldErrors(parsed.error);
}

describe("studentCodeSettingsInputSchema", () => {
  it("accepts a default with overrides", () => {
    expect(studentCodeSettingsInputSchema.safeParse(base).success).toBe(true);
  });

  it("requires a default format only when enabled", () => {
    expect(errors({ ...base, defaultPattern: " ", levels: [] })).toHaveProperty("defaultPattern");
    expect(errors({ ...base, defaultPattern: " " })).toEqual({});
    expect(errors({ ...base, enabled: false, defaultPattern: "", levels: [] })).toEqual({});
  });

  it("points at the failing field", () => {
    expect(errors({ ...base, defaultPattern: "#ST#" })).toEqual({ defaultPattern: expect.stringContaining("together at the end") });
    expect(errors({ ...base, levels: [{ levelId: "grade-10", pattern: "ST 2##" }] })).toHaveProperty(["level:grade-10"]);
    expect(errors({ ...base, levels: [{ levelId: "grade-10", pattern: "A#" }, { levelId: "grade-10", pattern: "B#" }] }))
      .toHaveProperty(["level:grade-10"]);
  });

  it("rejects a negative expected version and a foreign academy id shape", () => {
    expect(studentCodeSettingsInputSchema.safeParse({ ...base, expectedVersion: -1 }).success).toBe(false);
    expect(studentCodeSettingsInputSchema.safeParse({ ...base, academyId: "academy" }).success).toBe(false);
  });
});
