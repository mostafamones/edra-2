import { expect, it } from "vitest";
import { normalizePrompt } from "./prompt";
import { mathIssue } from "@/lib/math";

it("removes question 14 labels outside and inside the fraction span without losing its numerator", () => {
  const equation = String.raw`\frac{\text{س}}{2} + \frac{\text{ص}}{3} = \frac{1}{3}`;
  for (const source of [`14) \\(${equation}\\)`, `\\(14) ${equation}\\)`, `(١٤) \\(${equation}\\)`]) {
    expect(normalizePrompt(source, "14")).toBe(`\\(${equation}\\)`);
  }
  expect(normalizePrompt(String.raw`\(14 + \frac{1}{3}\)`, "14")).toBe(String.raw`\(14 + \frac{1}{3}\)`);
});

it("repairs the duplicated Arabic instruction and bare equations from question 3.6", () => {
  const instruction = "أوجد في ح × ح مجموعة الحل لكل زوج من المعادلات الآتية جبرياً وبيانياً:";
  const repeated = String.raw`أوجد في \text{ح} \times \text{ح} مجموعة الحل لكل زوج من المعادلات الآتية جبرياً وبيانياً: (6) 3 \text{س} + 4 \text{ص} = 11 ، 2 \text{س} + 4 \text{ص} = 0`;
  const result = normalizePrompt(`${instruction}\n${repeated}`, "3.6");
  expect(result.match(/أوجد/g)).toHaveLength(1);
  expect(result).not.toContain("(6)");
  expect(result).toContain(String.raw`\(3 \text{س} + 4 \text{ص} = 11\)`);
  expect(result).toContain(String.raw`\(2 \text{س} + 4 \text{ص} = 0\)`);
  expect(normalizePrompt(result, "3.6")).toBe(result);
  expect(mathIssue(result)).toBeUndefined();
  expect(normalizePrompt(repeated, "3.6", instruction)).toBe(result);
});

it("keeps distinct instructions, coefficients and nonmatching printed numbers", () => {
  expect(normalizePrompt("First instruction:\nSecond instruction: 6x = 2", "3.6"))
    .toBe("First instruction:\nSecond instruction: 6x = 2");
  expect(normalizePrompt("(7) 6x = 2", "3.6")).toBe("(7) 6x = 2");
  expect(normalizePrompt("Calculate each value\n6x = 2", "1", "Calculate each value"))
    .toBe("Calculate each value\n6x = 2");
});
