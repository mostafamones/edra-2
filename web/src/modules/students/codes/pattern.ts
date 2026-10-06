/**
 * Student code grammar. Mirrors normalize_student_code_text, normalize_student_code, and
 * normalize_student_code_pattern in the student_code_foundation migration; keep both in step
 * (supabase/tests/student_codes.sql checks the same cases as pattern.test.ts).
 *
 * Codes are strings, never numbers: leading zeroes are part of the value.
 */

export const STUDENT_CODE_MAX_LENGTH = 20;
export const PATTERN_PREFIX_MAX_LENGTH = 12;
export const PATTERN_MAX_WIDTH = 8;

// ASCII whitespace only, matching the database's btrim set (space, tab, LF, VT, FF, CR).
const OUTER_BLANK = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;

/** Outer-trims and uppercases ASCII letters; null when any character outside the grammar remains. */
function normalizeText(value: string, allowHash: boolean): string | null {
  const trimmed = value.replace(OUTER_BLANK, "");
  if (!(allowHash ? /^[A-Za-z0-9#-]+$/ : /^[A-Za-z0-9-]+$/).test(trimmed)) return null;
  return trimmed.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

/** Canonical code (1–20 of A–Z, 0–9, '-'), or null when the value is not an acceptable code. */
export function normalizeStudentCode(value: string): string | null {
  const code = normalizeText(value, false);
  return code && code.length <= STUDENT_CODE_MAX_LENGTH ? code : null;
}

export type StudentCodePattern = {
  /** Canonical formula, e.g. `ST2###`. */
  pattern: string;
  prefix: string;
  width: number;
  /** Number of codes the formula can produce (values 1 … 10^width − 1). */
  capacity: number;
};

export type PatternIssue = "empty" | "characters" | "no_block" | "block_position" | "prefix_length" | "width";

const ISSUE_MESSAGES: Record<PatternIssue, string> = {
  empty: "Enter a format, for example #### or ST2###.",
  characters: "Use only letters, digits, hyphens, and # (no spaces or other symbols).",
  no_block: "End the format with one to eight # characters for the number.",
  block_position: "Put all # characters together at the end, for example ST2###.",
  prefix_length: `Keep the text before the # characters to ${PATTERN_PREFIX_MAX_LENGTH} characters or fewer.`,
  width: `Use between 1 and ${PATTERN_MAX_WIDTH} # characters.`,
};

export function patternIssueMessage(issue: PatternIssue) {
  return ISSUE_MESSAGES[issue];
}

export type PatternResult = { ok: true; value: StudentCodePattern } | { ok: false; issue: PatternIssue; message: string };

function fail(issue: PatternIssue): PatternResult {
  return { ok: false, issue, message: ISSUE_MESSAGES[issue] };
}

/** Parses a formula: a literal prefix of 0–12 [A-Z0-9-] followed by one trailing block of 1–8 '#'. */
export function parseStudentCodePattern(value: string): PatternResult {
  if (value.replace(OUTER_BLANK, "") === "") return fail("empty");
  const pattern = normalizeText(value, true);
  if (pattern === null) return fail("characters");
  const block = /#+$/.exec(pattern);
  if (!block) return fail(pattern.includes("#") ? "block_position" : "no_block");
  const prefix = pattern.slice(0, block.index);
  if (prefix.includes("#")) return fail("block_position");
  const width = block[0].length;
  if (width > PATTERN_MAX_WIDTH) return fail("width");
  if (prefix.length > PATTERN_PREFIX_MAX_LENGTH) return fail("prefix_length");
  return { ok: true, value: { pattern, prefix, width, capacity: 10 ** width - 1 } };
}

/** The code for allocation value `n` (1-based). Throws outside the formula's range. */
export function formatStudentCode(pattern: StudentCodePattern, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > pattern.capacity) throw new RangeError("Value outside the formula's range");
  return pattern.prefix + String(n).padStart(pattern.width, "0");
}

/** Illustrative codes: the first values and the last one. Reserves nothing. */
export function exampleStudentCodes(pattern: StudentCodePattern): string[] {
  const values = [1, 2, 3].filter((n) => n <= pattern.capacity);
  if (pattern.capacity > 3) values.push(pattern.capacity);
  return values.map((n) => formatStudentCode(pattern, n));
}

/** Whether a normalized code is the formula's prefix followed by exactly its number of digits. */
export function matchesStudentCodePattern(code: string, pattern: StudentCodePattern): boolean {
  if (!code.startsWith(pattern.prefix) || code.length !== pattern.prefix.length + pattern.width) return false;
  return [...code.slice(pattern.prefix.length)].every((char) => char >= "0" && char <= "9");
}
