import { describe, expect, it } from "vitest";

import { exampleStudentCodes, formatStudentCode, matchesStudentCodePattern, normalizeStudentCode, parseStudentCodePattern } from "./pattern";

// The same cases are asserted against the database in supabase/tests/student_codes.sql.
describe("parseStudentCodePattern", () => {
  it("splits the prefix and the digit block", () => {
    expect(parseStudentCodePattern("####")).toEqual({ ok: true, value: { pattern: "####", prefix: "", width: 4, capacity: 9999 } });
    expect(parseStudentCodePattern("ST2###")).toEqual({ ok: true, value: { pattern: "ST2###", prefix: "ST2", width: 3, capacity: 999 } });
  });

  it("normalizes case and outer whitespace but keeps digits", () => {
    expect(parseStudentCodePattern("  st2### ")).toMatchObject({ ok: true, value: { pattern: "ST2###" } });
    expect(parseStudentCodePattern("\tst-2###\n")).toMatchObject({ ok: true, value: { pattern: "ST-2###" } });
    expect(parseStudentCodePattern("00########")).toMatchObject({ ok: true, value: { prefix: "00", width: 8, capacity: 99_999_999 } });
  });

  it("accepts the length boundaries", () => {
    expect(parseStudentCodePattern("ABCDEFGHIJKL#")).toMatchObject({ ok: true, value: { prefix: "ABCDEFGHIJKL", width: 1, capacity: 9 } });
    expect(parseStudentCodePattern("ABCDEFGHIJKLM#")).toMatchObject({ ok: false, issue: "prefix_length" });
    expect(parseStudentCodePattern("#########")).toMatchObject({ ok: false, issue: "width" });
  });

  it("rejects malformed formulas with an actionable issue", () => {
    expect(parseStudentCodePattern("")).toMatchObject({ ok: false, issue: "empty" });
    expect(parseStudentCodePattern("   ")).toMatchObject({ ok: false, issue: "empty" });
    expect(parseStudentCodePattern("ST")).toMatchObject({ ok: false, issue: "no_block" });
    expect(parseStudentCodePattern("#ST##")).toMatchObject({ ok: false, issue: "block_position" });
    expect(parseStudentCodePattern("ST##A#")).toMatchObject({ ok: false, issue: "block_position" });
    expect(parseStudentCodePattern("ST ###")).toMatchObject({ ok: false, issue: "characters" });
    expect(parseStudentCodePattern("ST_###")).toMatchObject({ ok: false, issue: "characters" });
    expect(parseStudentCodePattern("ŞT###")).toMatchObject({ ok: false, issue: "characters" });
    expect(parseStudentCodePattern(" ST###")).toMatchObject({ ok: false, issue: "characters" });
  });
});

describe("normalizeStudentCode", () => {
  it("uppercases, trims, and preserves leading zeroes", () => {
    expect(normalizeStudentCode(" st2-001 ")).toBe("ST2-001");
    expect(normalizeStudentCode("0007")).toBe("0007");
    expect(normalizeStudentCode("ABCDEFGHIJ0123456789")).toBe("ABCDEFGHIJ0123456789");
  });

  it("rejects empty, long, spaced, control, and non-ASCII values", () => {
    expect(normalizeStudentCode("ABCDEFGHIJ01234567890")).toBeNull();
    expect(normalizeStudentCode("   ")).toBeNull();
    expect(normalizeStudentCode("ST 001")).toBeNull();
    expect(normalizeStudentCode("ST\u0001")).toBeNull();
    expect(normalizeStudentCode("ST#1")).toBeNull();
    expect(normalizeStudentCode("straße")).toBeNull();
  });
});

describe("formatting and exhaustion", () => {
  const parse = (value: string) => {
    const result = parseStudentCodePattern(value);
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };

  it("pads to the block width", () => {
    expect(formatStudentCode(parse("####"), 1)).toBe("0001");
    expect(formatStudentCode(parse("ST2###"), 42)).toBe("ST2042");
    expect(formatStudentCode(parse("ST2###"), 999)).toBe("ST2999");
  });

  it("stops at 10^width - 1", () => {
    expect(() => formatStudentCode(parse("ST2###"), 1000)).toThrow(RangeError);
    expect(() => formatStudentCode(parse("X#"), 0)).toThrow(RangeError);
    expect(formatStudentCode(parse("########"), 99_999_999)).toBe("99999999");
  });

  it("previews the first and last codes", () => {
    expect(exampleStudentCodes(parse("####"))).toEqual(["0001", "0002", "0003", "9999"]);
    expect(exampleStudentCodes(parse("ST2###"))).toEqual(["ST2001", "ST2002", "ST2003", "ST2999"]);
    expect(exampleStudentCodes(parse("X#"))).toEqual(["X1", "X2", "X3", "X9"]);
  });
});

describe("matchesStudentCodePattern", () => {
  const plain = parseStudentCodePattern("####");
  const prefixed = parseStudentCodePattern("ST2###");
  if (!plain.ok || !prefixed.ok) throw new Error("fixture");

  it("accepts the prefix plus exactly the formula's digits", () => {
    expect(matchesStudentCodePattern("0007", plain.value)).toBe(true);
    expect(matchesStudentCodePattern("ST2007", prefixed.value)).toBe(true);
  });

  it("rejects other lengths, prefixes, and non-digits", () => {
    for (const code of ["7", "00007", "ST07", "AB07", "00A7"]) expect(matchesStudentCodePattern(code, plain.value)).toBe(false);
    for (const code of ["2007", "ST2", "ST2A07", "ST20007", "XT2007"]) expect(matchesStudentCodePattern(code, prefixed.value)).toBe(false);
  });
});
