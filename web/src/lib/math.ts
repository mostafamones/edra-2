import katex from "katex";
import { wrapBareMath } from "./math-source";

export type MathSegment = { kind: "text"; value: string } | { kind: "code"; value: string } | { kind: "math"; value: string; source: string; display: boolean };

/** TeacherGen's explicit LaTeX spans. Ordinary slashes, currency and code stay literal. */
export function splitMath(value: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const pattern = /```[\s\S]*?```|`[^`\n]*`|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > end) segments.push({ kind: "text", value: value.slice(end, match.index) });
    segments.push(match[0].startsWith("`") ? { kind: "code", value: match[0] }
      : { kind: "math", value: match[1] ?? match[2], source: match[0], display: match[2] !== undefined });
    end = match.index + match[0].length;
  }
  if (end < value.length) segments.push({ kind: "text", value: value.slice(end) });
  return segments;
}

export function normalizeMathSource(value: string): string {
  return splitMath(value).map(segment => segment.kind === "text" ? /\\[()[\]]/.test(segment.value) ? segment.value : wrapBareMath(segment.value)
    : segment.kind === "math" ? segment.source : segment.value).join("");
}

/** Match the prose direction across the math text and its scroll surface. */
export function mathDirection(value: string): "rtl" | "ltr" {
  const prose = splitMath(normalizeMathSource(value)).filter(segment => segment.kind !== "math").map(segment => segment.value).join("");
  const firstLetter = /\p{L}/u.exec(prose)?.[0];
  return firstLetter && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(firstLetter) ? "rtl" : "ltr";
}

/** Generate only MathML, with no trusted HTML/URL commands or external font dependency. */
export function renderMath(value: string, display = false): string {
  if (value.length > 2500) throw new Error("Equation exceeds the rendering limit");
  if (/[\u0008\u000b\u000c]|\t(?:imes|heta|ext)\b/u.test(value)) throw new Error("Damaged LaTeX escape");
  return katex.renderToString(value, {
    output: "mathml", displayMode: display, trust: false, throwOnError: true,
    strict: "ignore", maxExpand: 500, maxSize: 20,
  });
}

export function mathIssue(value: string): string | undefined {
  for (const segment of splitMath(normalizeMathSource(value))) {
    if (segment.kind === "code") continue;
    if (segment.kind === "text") {
      if (/\\[()[\]]|\\[A-Za-z]+|[\u0008\u000b\u000c]/u.test(segment.value)) return "Check the mathematical notation against the source; an equation delimiter or JSON escape is damaged.";
    } else {
      if (/[\u0008\u000b\u000c]|\t(?:imes|heta|ext)\b/u.test(segment.value)) return "Check the mathematical notation against the source; a LaTeX command was damaged by JSON escaping.";
      try { renderMath(segment.value, segment.display); }
      catch { return "Check the mathematical notation against the source; an equation could not be rendered."; }
    }
  }
}

export const hasMath = (value: string) => splitMath(normalizeMathSource(value)).some(segment => segment.kind === "math");
