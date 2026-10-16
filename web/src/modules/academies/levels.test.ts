import { describe, expect, it } from "vitest";
import { convertLegacyLevelId, GLOBAL_LEVEL_IDS, legacyLevelAlias, levelLabel } from "./levels";

describe("level catalog", () => {
  it("offers the six Egyptian levels", () => {
    expect(GLOBAL_LEVEL_IDS).toEqual([
      "preparatory-1", "preparatory-2", "preparatory-3", "secondary-1", "secondary-2", "secondary-3",
    ]);
    expect(levelLabel("preparatory-1")).toBe("First Preparatory");
  });

  it("maps legacy ids and import aliases to the replacements", () => {
    expect(convertLegacyLevelId("grade-9")).toBe("preparatory-3");
    expect(convertLegacyLevelId("grade-12")).toBe("secondary-3");
    expect(convertLegacyLevelId("secondary-1")).toBe("secondary-1");
    expect(legacyLevelAlias("Grade 10")).toBe("secondary-1");
    expect(legacyLevelAlias("grade_11")).toBe("secondary-2");
    expect(legacyLevelAlias("Grade 99")).toBeUndefined();
  });
});
