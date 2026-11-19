import { expect, it } from "vitest";
import { hasMath, mathDirection, mathIssue, normalizeMathSource, renderMath, splitMath } from "./math";
import { mathExamples } from "./math.fixtures";

it("chooses scroll direction from prose while keeping math-only content left to right", () => {
  expect(mathDirection(String.raw`١. أوجد \(\sqrt{9}\)`)).toBe("rtl");
  expect(mathDirection(String.raw`1. Calculate \(\sqrt{9}\)`)).toBe("ltr");
  expect(mathDirection(String.raw`\(\sqrt{\text{س}}\)`)).toBe("ltr");
});

it.each(mathExamples)("preserves and renders $name in inline and display notation", ({ source, tags }) => {
  for (const display of [false, true]) {
    const wrapped = display ? `\\[${source}\\]` : `\\(${source}\\)`;
    expect(normalizeMathSource(wrapped)).toBe(wrapped);
    expect(mathIssue(wrapped)).toBeUndefined();
    const html = renderMath(source, display);
    for (const tag of tags) expect(html).toContain(`<${tag}`);
    expect(html).toContain('encoding="application/x-tex"');
  }
});

it.each(mathExamples.filter(example => "bare" in example))("repairs omitted delimiters for $name without changing its math", ({ source }) => {
  const normalized = normalizeMathSource(source);
  expect(mathIssue(normalized)).toBeUndefined();
  expect(normalizeMathSource(normalized)).toBe(normalized);
  expect(splitMath(normalized).filter(segment => segment.kind === "math").map(segment => segment.value).join("")).toBe(source);
});

it.each([
  String.raw`\(\sqrt{9\)`, String.raw`\(\sqrt[3{27}\)`, String.raw`\(\frac{1}{\)`,
  String.raw`\(x^{2\)`, String.raw`\(\left(\frac{1}{2}\)`, String.raw`\(\begin{cases}x&x>0\)`,
  String.raw`\sqrt{1+\frac{2}{`, String.raw`\(\unknownRoot{2}\)`,
])("flags damaged mathematical source rather than silently repairing %s", source => {
  expect(mathIssue(source)).toMatch(/notation/);
});

it("delimits bare TeX without changing existing math, code or ordinary slash text", () => {
  const raw = String.raw`أوجد \frac{1}{\sqrt[3]{x}} + 2`;
  const result = normalizeMathSource(raw);
  expect(result).toBe(String.raw`أوجد \(\frac{1}{\sqrt[3]{x}} + 2\)`);
  expect(normalizeMathSource(result)).toBe(result);
  const literal = 'a/b costs $5. `\\sqrt{4}`\n```tex\n\\frac{1}{2}\n```';
  expect(normalizeMathSource(literal)).toBe(literal);
  expect(mathIssue(String.raw`\frac{1}{`)).toBeDefined();
});

it("preserves Arabic fractions, indexed roots and exponents as mathematical structure", () => {
  const source = String.raw`أوجد \(\frac{\text{س}^{٢} + ١}{\sqrt[٣]{\text{ص}}}\) ثم \[\sqrt{١٦} \div ٢ \times ٣\]`;
  const equations = splitMath(source).filter(segment => segment.kind === "math");
  expect(equations).toHaveLength(2);
  const html = equations.map(segment => renderMath(segment.value, segment.display)).join("");
  for (const tag of ["mfrac", "msup", "mroot", "msqrt"]) expect(html).toContain(`<${tag}>`);
  expect(html).toContain("س");
  expect(html).toContain("ص");
  expect(mathIssue(source)).toBeUndefined();
});

it("leaves division prose, currency and source code literal", () => {
  const source = 'Read a/b at $5 each. `\\(literal\\)`\n```cpp\n\\(code\\)\n```';
  expect(hasMath(source)).toBe(false);
  expect(splitMath(source).map(segment => segment.value).join("")).toBe(source);
  expect(mathIssue(source)).toBeUndefined();
});

it("flags incomplete notation, corrupted JSON escapes and unsupported equations", () => {
  for (const source of [String.raw`\(\frac{1}{2}`, "\\(\frac{1}{2}\\)", String.raw`\(\notAnActualCommand{1}\)`]) {
    expect(mathIssue(source)).toMatch(/notation/);
  }
  expect(() => renderMath("x".repeat(2501))).toThrow(/limit/);
});

it("does not trust HTML or URL commands in model-generated equations", () => {
  const html = renderMath(String.raw`\href{javascript:alert(1)}{x}`);
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain("<script");
});
