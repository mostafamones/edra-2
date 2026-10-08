import { describe, expect, it } from "vitest";

import { formatScore, fromHundredths, isValidMaxScore, isValidScoreText, sumScores, toHundredths } from "./score";

describe("exact decimal marks", () => {
  it("parses at most two fractional digits exactly", () => {
    expect(toHundredths("0")).toBe(0);
    expect(toHundredths("12.5")).toBe(1250);
    expect(toHundredths("12.05")).toBe(1205);
    expect(toHundredths(" 7.25 ")).toBe(725);
    expect(toHundredths("1000")).toBe(100000);
  });

  it("rejects unsupported precision and non-decimal text instead of rounding", () => {
    for (const value of ["1.234", "", ".5", "5.", "-1", "1e2", "NaN", "Infinity", "1,5", "123456", "0x10"]) {
      expect(toHundredths(value)).toBeNull();
    }
  });

  it("adds without floating-point error", () => {
    expect(sumScores(["0.1", "0.2"])).toBe("0.3");
    expect(sumScores(["10", "15"])).toBe("25");
    expect(sumScores(["10.25", "14.75"])).toBe("25");
    expect(sumScores(["10", "1.234"])).toBeNull();
  });

  it("accepts positive maxima up to 1000", () => {
    expect(isValidMaxScore("0.01")).toBe(true);
    expect(isValidMaxScore("1000")).toBe(true);
    expect(isValidMaxScore("0")).toBe(false);
    expect(isValidMaxScore("1000.01")).toBe(false);
    expect(isValidMaxScore("2.555")).toBe(false);
  });

  it("formats stored decimals canonically", () => {
    expect(fromHundredths(1250)).toBe("12.5");
    expect(formatScore("25.00")).toBe("25");
    expect(formatScore("7.50")).toBe("7.5");
    expect(formatScore(12.5)).toBe("12.5");
  });
});

describe("isValidScoreText", () => {
  it("accepts zero up to the part maximum with at most two decimals", () => {
    expect(isValidScoreText("0", "10")).toBe(true);
    expect(isValidScoreText("10", "10")).toBe(true);
    expect(isValidScoreText("9.75", "10")).toBe(true);
  });

  it("rejects negatives, over-maximum, extra precision, and text", () => {
    expect(isValidScoreText("10.01", "10")).toBe(false);
    expect(isValidScoreText("-1", "10")).toBe(false);
    expect(isValidScoreText("1.234", "10")).toBe(false);
    expect(isValidScoreText("abc", "10")).toBe(false);
  });
});
