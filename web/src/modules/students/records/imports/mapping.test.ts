import ExcelJS from "exceljs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { normalizeEgyptianPhone } from "../../../../lib/phone";
import { IMPORT_LIMITS } from "./limits";
import {
  buildStagedRows, chunkStagedRows, columnName, columnsFromHeader, emptyMapping, encodedSize, mappingProblems, suggestMapping, suggestHeaderIndex, unmappedColumns,
} from "./mapping";
import { parseCsv } from "./parsers/csv";
import { parseJson } from "./parsers/json";
import { parseXlsx } from "./parsers/xlsx";
import { buildTemplate, csvTemplate, instructionLines, jsonTemplate, templateExamples, xlsxTemplate } from "./templates";
import type { ParsedSource } from "./types";

const utf8 = (text: string) => new TextEncoder().encode(text);
const parsed = (text: string): ParsedSource => {
  const result = parseCsv(utf8(text));
  if (!result.ok) throw new Error(result.error.message);
  return result.source;
};
const NO_DEFAULTS = { levelId: "", trackId: "", primaryGroupId: "", participationType: "" } as const;

describe("column mapping", () => {
  it("finds headers after a title and reports each unused source column", () => {
    const source = parsed("Student export\nfull_name,student_phone,parent_phone,grade,type,Notes\nExample,01XXXXXXXXX,01XXXXXXXXX,Second Secondary,in_person,Keep\n");
    expect(suggestHeaderIndex(source)).toBe(1);
    const columns = columnsFromHeader(source, 1);
    expect(unmappedColumns(columns, suggestMapping(columns))).toEqual([{ id: "c5", label: "Notes" }]);
  });
  it("suggests fields from English and Arabic headers", () => {
    const source = parsed("الاسم,رقم الطالب,Parent Phone,Grade,الشعبة,Group Name,Student_Type,Notes\nx\n");
    expect(suggestMapping(columnsFromHeader(source, 0))).toEqual({
      full_name: "c0", student_phone: "c1", parent_phone: "c2", level: "c3", track: "c4", group: "c5", student_type: "c6",
    });
  });

  it("keeps duplicate headers distinct and names blank headers by column", () => {
    const columns = columnsFromHeader(parsed("Phone,Phone,\n1,2,3\n"), 0);
    expect(columns).toEqual([
      { id: "c0", label: "Phone" }, { id: "c1", label: "Phone (2)" }, { id: "c2", label: "Column C" },
    ]);
    // Only the first of two identical headers is suggested.
    expect(suggestMapping(columns).student_phone).toBe("c0");
    expect(columnName(26)).toBe("AA");
  });

  it("uses a chosen header record and ignores the rows above it", () => {
    const source = parsed("Class list\nfull_name,student_phone\nAli,0101\n");
    const result = buildStagedRows(source, 1, { ...emptyMapping(), full_name: "c0", student_phone: "c1" });
    expect(result).toEqual({ ok: true, rows: [{ ordinal: 1, sourceRow: 3, values: { full_name: "Ali", student_phone: "0101" } }] });
  });

  it("requires name and phones, and level and type unless defaulted", () => {
    expect(mappingProblems(emptyMapping(), NO_DEFAULTS).map((problem) => problem.field))
      .toEqual(["full_name", "student_phone", "parent_phone", "level", "student_type"]);
    const mapped = { ...emptyMapping(), full_name: "c0", student_phone: "c1", parent_phone: "c2" };
    expect(mappingProblems(mapped, { ...NO_DEFAULTS, levelId: "preparatory-3", participationType: "in_person" })).toEqual([]);
    expect(mappingProblems({ ...mapped, level: "c1" }, { ...NO_DEFAULTS, participationType: "in_person" }))
      .toEqual([{ field: null, message: "Each column can fill only one field." }]);
  });

  it("omits blank cells, keeps JSON null and problems, and identifies JSON items by position", () => {
    const result = parseJson(utf8(JSON.stringify([{ full_name: " ", group: null, level: { a: 1 } }, {}, { full_name: "Mona" }])));
    if (!result.ok) throw new Error(result.error.message);
    const built = buildStagedRows(result.source, 0, { ...emptyMapping(), full_name: "k0", group: "k1", level: "k2" });
    expect(built).toEqual({
      ok: true,
      rows: [
        { ordinal: 1, sourceRow: 1, values: { group: null, level: { problem: "nested" } } },
        { ordinal: 2, sourceRow: 3, values: { full_name: "Mona" } },
      ],
    });
  });

  it("rejects too many rows and overlong mapped cells", () => {
    const tall = parsed(`name\n${"x\n".repeat(IMPORT_LIMITS.rows + 1)}`);
    expect(buildStagedRows(tall, 0, { ...emptyMapping(), full_name: "c0" }).ok).toBe(false);
    const long = parsed(`name,notes\n${"a".repeat(IMPORT_LIMITS.cellLength + 1)},${"b".repeat(5000)}\n`);
    const mappedLong = buildStagedRows(long, 0, { ...emptyMapping(), full_name: "c0" });
    expect(mappedLong.ok ? null : mappedLong.message).toContain("Row 2");
    // Unmapped long cells are ignored.
    expect(buildStagedRows(parsed(`name,notes\nAli,${"b".repeat(5000)}\n`), 0, { ...emptyMapping(), full_name: "c0" }).ok).toBe(true);
  });

  it("chunks staged rows by count and encoded size", () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({ ordinal: index + 1, sourceRow: index + 2, values: { full_name: "x" } }));
    expect(chunkStagedRows(rows).map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    const heavy = Array.from({ length: 40 }, (_, index) => ({
      ordinal: index + 1, sourceRow: index + 2, values: { full_name: "م".repeat(2000), group: "ج".repeat(2000) },
    }));
    const chunks = chunkStagedRows(heavy);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(encodedSize(chunk)).toBeLessThanOrEqual(IMPORT_LIMITS.stageBytes);
    expect(chunks.flat()).toEqual(heavy);
  });
});

describe("templates", () => {
  const reference = {
    levels: [{ id: "secondary-2", name: "Second Secondary" }],
    tracks: [{ id: "science", levelId: "secondary-2", levelName: "Second Secondary", name: "Science" }],
    groups: [{ name: "Science A", levelId: "secondary-2", trackId: "science", levelName: "Second Secondary", trackName: "Science" }],
  };

  it("parses academy examples consistently in CSV, JSON, and Excel", async () => {
    const expected = [
      { full_name: "Example student 1", student_phone: "01XXXXXXXXX", parent_phone: "01XXXXXXXXX", level: "Second Secondary", track: "Science", group: "Science A", student_type: "in_person" },
      { full_name: "Example student 2", student_phone: "01XXXXXXXXX", parent_phone: "01XXXXXXXXX", level: "Second Secondary", track: "Science", group: "Unassigned", student_type: "online_only" },
    ];
    const csv = parseCsv(utf8(csvTemplate(reference)));
    if (!csv.ok) throw new Error(csv.error.message);
    expect(suggestMapping(columnsFromHeader(csv.source, 0))).toEqual({
      full_name: "c0", student_phone: "c1", parent_phone: "c2", level: "c3", track: "c4", group: "c5", student_type: "c6",
    });
    expect(csv.source.records).toHaveLength(3);
    const csvRows = buildStagedRows(csv.source, 0, suggestMapping(columnsFromHeader(csv.source, 0)));
    expect(csvRows.ok ? csvRows.rows.map((row) => row.values) : null).toEqual(expected);

    expect(JSON.parse(jsonTemplate(reference))).toEqual(expected);
    const json = parseJson(utf8(jsonTemplate(reference)));
    if (!json.ok) throw new Error(json.error.message);
    const jsonRows = buildStagedRows(json.source, 0, suggestMapping(columnsFromHeader(json.source, 0)));
    expect(jsonRows.ok ? jsonRows.rows.map((row) => row.values) : null).toEqual(expected);

    const xlsx = await parseXlsx(new Uint8Array(await xlsxTemplate(reference)), null);
    if (!xlsx.ok) throw new Error(xlsx.error.message);
    expect(xlsx.source.sheet).toBe("Students");
    expect(xlsx.source.sheets).toEqual(["Students", "Instructions"]);
    expect(xlsx.source.records).toHaveLength(3);
    expect(suggestMapping(columnsFromHeader(xlsx.source, 0)).parent_phone).toBe("c2");
    const xlsxRows = buildStagedRows(xlsx.source, 0, suggestMapping(columnsFromHeader(xlsx.source, 0)));
    expect(xlsxRows.ok ? xlsxRows.rows.map((row) => row.values) : null).toEqual(expected);

    expect(await buildTemplate("csv", reference)).toBe(csvTemplate(reference));
    expect(await buildTemplate("json", reference)).toBe(jsonTemplate(reference));
  });

  it("formats phone columns as text and lists the academy’s valid values", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await xlsxTemplate(reference) as never);
    expect(book.getWorksheet("Students")?.getColumn(2).numFmt).toBe("@");
    expect(book.getWorksheet("Students")?.getColumn(3).numFmt).toBe("@");
    expect(book.getWorksheet("Students")?.getCell("B2").value).toBe("01XXXXXXXXX");
    const text = instructionLines(reference).flat().join("\n");
    expect(text).toContain("secondary-2 — Second Secondary");
    expect(text).toContain("Second Secondary — Science");
    expect(text).toContain("Science A — Second Secondary · Science");
    expect(text).toContain("online_only (Online only)");
    expect(text).toContain("Replace the example names and masked phone numbers");
    for (const example of templateExamples(reference)) {
      expect(example.full_name).toMatch(/^Example student \d+$/);
      expect(normalizeEgyptianPhone(example.student_phone)).toBeNull();
      expect(normalizeEgyptianPhone(example.parent_phone)).toBeNull();
    }
  });

  it("covers every level/track and matches groups by IDs even when track names repeat", () => {
    const examples = templateExamples({
      levels: [...reference.levels, { id: "secondary-3", name: "Third Secondary" }, { id: "secondary-1", name: "First Secondary" }],
      tracks: [
        ...reference.tracks,
        { id: "arts", levelId: "secondary-2", levelName: "Second Secondary", name: "Arts" },
        { id: "science-12", levelId: "secondary-3", levelName: "Third Secondary", name: "Science" },
      ],
      groups: [
        { name: "Science B", levelId: "secondary-3", trackId: "science-12", levelName: "Third Secondary", trackName: "Science" },
        ...reference.groups,
        { name: "Class 10", levelId: "secondary-1", trackId: null, levelName: "First Secondary", trackName: null },
      ],
    });
    expect(examples.map(({ level, track, group, student_type }) => [level, track, group, student_type])).toEqual([
      ["Second Secondary", "Science", "Science A", "in_person"],
      ["Second Secondary", "Arts", "Unassigned", "in_person"],
      ["Third Secondary", "Science", "Science B", "in_person"],
      ["First Secondary", "", "Class 10", "in_person"],
      ["Second Secondary", "Science", "Unassigned", "online_only"],
    ]);
  });

  it("handles missing groups, levels without tracks, and an empty academy", () => {
    expect(templateExamples({ ...reference, groups: [] }).every((row) => row.group === "Unassigned")).toBe(true);
    const noTracks = templateExamples({ ...reference, tracks: [], groups: [] });
    expect(noTracks).toHaveLength(2);
    expect(noTracks.every((row) => row.track === "" && row.group === "Unassigned")).toBe(true);
    expect(templateExamples({ levels: [], tracks: [], groups: [] })).toEqual([]);
  });

  it("preserves Arabic, commas, and quotes in CSV and neutralizes spreadsheet formulas", () => {
    const csv = csvTemplate({
      ...reference,
      levels: [{ id: "secondary-2", name: 'الصف، "الثاني", تجريبي' }],
      groups: [{ ...reference.groups[0], name: '=HYPERLINK("https://example.com")' }],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const cells = Papa.parse<string[]>(csv).data;
    expect(cells[1][3]).toBe('الصف، "الثاني", تجريبي');
    expect(cells[1][5]).toBe('\'=HYPERLINK("https://example.com")');
  });
});
