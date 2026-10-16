import ExcelJS from "exceljs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { IMPORT_LIMITS } from "./limits";
import { parseSource } from "./parsers";
import { parseCsv } from "./parsers/csv";
import { parseJson } from "./parsers/json";
import { checkExpansion, parseXlsx } from "./parsers/xlsx";
import type { ParseResult, ParsedSource } from "./types";

const utf8 = (text: string) => new TextEncoder().encode(text);
const ok = (result: ParseResult): ParsedSource => {
  if (!result.ok) throw new Error(`expected a parse, got ${result.error.code}: ${result.error.message}`);
  return result.source;
};
const fail = (result: ParseResult) => {
  if (result.ok) throw new Error("expected the parse to fail");
  return result.error;
};

async function workbook(build: (workbook: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  build(book);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe("CSV parsing", () => {
  it("reads quoted fields, embedded newlines, Arabic text, and keeps values as strings", () => {
    const source = ok(parseCsv(utf8('full_name,student_phone\n"Hassan, Omar",01012345678\n"مريم\nحسن",1012345679\n')));
    expect(source.records).toEqual([
      { sourceRow: 1, cells: ["full_name", "student_phone"] },
      { sourceRow: 2, cells: ["Hassan, Omar", "01012345678"] },
      { sourceRow: 3, cells: ["مريم\nحسن", "1012345679"] },
    ]);
  });

  it("strips a UTF-8 BOM and decodes BOM-marked UTF-16", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("name\nعلي\n")]);
    expect(ok(parseCsv(withBom)).records[0].cells).toEqual(["name"]);

    const text = "name\nعلي\n";
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let index = 0; index < text.length; index++) {
      utf16[2 + index * 2] = text.charCodeAt(index) & 0xff;
      utf16[3 + index * 2] = text.charCodeAt(index) >> 8;
    }
    expect(ok(parseCsv(utf16)).records[1].cells).toEqual(["علي"]);
  });

  it("rejects text that isn’t valid UTF-8", () => {
    expect(fail(parseCsv(new Uint8Array([0x6e, 0x61, 0xff, 0xfe, 0x0a]))).code).toBe("encoding");
  });

  it("guesses semicolon and tab delimiters", () => {
    expect(ok(parseCsv(utf8("a;b\n1;2\n"))).records[1].cells).toEqual(["1", "2"]);
    expect(ok(parseCsv(utf8("a\tb\n1\t2\n"))).records[1].cells).toEqual(["1", "2"]);
  });

  it("skips blank records but keeps source record numbers", () => {
    const source = ok(parseCsv(utf8("name\n\n , \nAli\n")));
    expect(source.records.map((record) => record.sourceRow)).toEqual([1, 4]);
  });

  it("enforces the column and row limits", () => {
    const wide = Array.from({ length: IMPORT_LIMITS.columns + 1 }, (_, index) => `c${index}`).join(",");
    expect(fail(parseCsv(utf8(`${wide}\n`))).code).toBe("too_many_columns");
    const tall = `name\n${"x\n".repeat(IMPORT_LIMITS.rows + 200)}`;
    expect(fail(parseCsv(utf8(tall))).code).toBe("too_many_rows");
  });

  it("rejects files over the size limit before parsing", async () => {
    expect(fail(await parseSource(new Uint8Array(IMPORT_LIMITS.fileBytes + 1), "csv", null)).code).toBe("too_large");
  });
});

describe("JSON parsing", () => {
  it("uses the union of keys as columns and array positions as rows", () => {
    const source = ok(parseJson(utf8(JSON.stringify([
      { full_name: "Ali", student_phone: 1012345678 },
      {},
      { full_name: "Mona", group: null, extra: true },
    ]))));
    expect(source.columns?.map((column) => column.label)).toEqual(["full_name", "student_phone", "group", "extra"]);
    expect(source.records).toEqual([
      { sourceRow: 1, cells: ["Ali", "1012345678", "", ""] },
      { sourceRow: 3, cells: ["Mona", "", null, { problem: "unsupported" }] },
    ]);
  });

  it("marks nested values as problems", () => {
    const source = ok(parseJson(utf8(JSON.stringify([{ full_name: { first: "Ali" }, level: ["preparatory-3"] }]))));
    expect(source.records[0].cells).toEqual([{ problem: "nested" }, { problem: "nested" }]);
  });

  it("rejects anything but a top-level array of objects", () => {
    expect(fail(parseJson(utf8('{"full_name":"Ali"}'))).code).toBe("malformed");
    expect(fail(parseJson(utf8('[{"a":1}, 2]'))).message).toContain("Item 2");
    expect(fail(parseJson(utf8("[{"))).code).toBe("malformed");
    expect(fail(parseJson(utf8("[{}]"))).code).toBe("empty");
  });
});

describe("XLSX parsing", () => {
  it("reads the first visible worksheet with actual row numbers and converts numeric phones", async () => {
    const bytes = await workbook((book) => {
      const hidden = book.addWorksheet("Hidden");
      hidden.state = "hidden";
      hidden.addRow(["ignored"]);
      const sheet = book.addWorksheet("Students");
      sheet.getCell("A1").value = "Class list";
      sheet.getCell("A3").value = "full_name";
      sheet.getCell("B3").value = "student_phone";
      sheet.getCell("A4").value = "مريم";
      sheet.getCell("B4").value = 1012345678;
      book.addWorksheet("Other").addRow(["x"]);
    });
    const source = ok(await parseXlsx(bytes, null));
    expect(source.sheets).toEqual(["Students", "Other"]);
    expect(source.sheet).toBe("Students");
    expect(source.records).toEqual([
      { sourceRow: 1, cells: ["Class list"] },
      { sourceRow: 3, cells: ["full_name", "student_phone"] },
      { sourceRow: 4, cells: ["مريم", "1012345678"] },
    ]);
    expect(ok(await parseXlsx(bytes, "Other")).records[0].cells).toEqual(["x"]);
  });

  it("keeps formulas, dates, errors, and booleans as problems without evaluating them", async () => {
    const bytes = await workbook((book) => {
      const sheet = book.addWorksheet("Students");
      sheet.getCell("A1").value = { formula: "1+1", result: 2 };
      sheet.getCell("B1").value = new Date(Date.UTC(2030, 0, 1));
      sheet.getCell("C1").value = { error: "#N/A" };
      sheet.getCell("D1").value = true;
      sheet.getCell("E1").value = { text: "Link text", hyperlink: "https://example.com" };
      sheet.getCell("F1").value = { richText: [{ text: "Rich " }, { text: "text" }] };
    });
    expect(ok(await parseXlsx(bytes, null)).records[0].cells).toEqual([
      { problem: "formula" }, { problem: "date" }, { problem: "error" }, { problem: "unsupported" }, "Link text", "Rich text",
    ]);
  });

  it("rejects packages that expand beyond the limit and non-workbooks", async () => {
    const bomb = zipSync({ "xl/huge.xml": new Uint8Array(IMPORT_LIMITS.expandedBytes + 1) }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(IMPORT_LIMITS.fileBytes);
    expect(checkExpansion(bomb)?.code).toBe("expanded_too_large");
    expect(fail(await parseXlsx(utf8("not a zip"), null)).code).toBe("malformed");
    expect(fail(await parseXlsx(zipSync({ "a.txt": strToU8("hi") }), null)).code).toBe("empty");
  });

  it("enforces the column limit", async () => {
    const bytes = await workbook((book) => {
      book.addWorksheet("Students").addRow(Array.from({ length: IMPORT_LIMITS.columns + 1 }, (_, index) => `c${index}`));
    });
    expect(fail(await parseXlsx(bytes, null)).code).toBe("too_many_columns");
  });
});
