import { describe, expect, it } from "vitest";

import { formatScore, fromHundredths, isValidScoreText, sumScores, toHundredths } from "./score";

describe("exact scores", () => {
  it("adds in hundredths without floating-point error", () => {
    expect(sumScores(["0.1", "0.2", "2.50"])).toBe("2.8");
    expect(sumScores(["1", "x"])).toBeNull();
  });

  it("rejects unsupported precision and formats canonically", () => {
    expect(toHundredths("1.255")).toBeNull();
    expect(fromHundredths(1250)).toBe("12.5");
    expect(formatScore("10.00")).toBe("10");
  });

  it("treats zero as a valid mark up to the maximum", () => {
    expect(isValidScoreText("0", "6")).toBe(true);
    expect(isValidScoreText("6.01", "6")).toBe(false);
  });
});
