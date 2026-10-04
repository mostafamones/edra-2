import ExcelJS from "exceljs";
import { Unzip, UnzipInflate, unzipSync } from "fflate";

import { IMPORT_LIMITS, MAX_PARSED_RECORDS } from "../limits";
import type { CellValue, ParseError, ParseResult, SourceRecord } from "../types";

const MALFORMED: ParseError = { code: "malformed", message: "The file isn’t a readable Excel workbook (.xlsx). Save it as .xlsx and try again." };
const EXPANDED: ParseError = {
  code: "expanded_too_large",
  message: `The workbook expands to more than ${IMPORT_LIMITS.expandedBytes / 1024 / 1024} MiB. Remove extra sheets or images, or save the students as CSV.`,
};

/**
 * Checks the package's declared and actual uncompressed size before ExcelJS loads it, so a small
 * file cannot expand without bound. Returns an error, or null when the workbook is within limits.
 */
export function checkExpansion(bytes: Uint8Array): ParseError | null {
  let declared = 0;
  try {
    unzipSync(bytes, { filter: (file) => { declared += file.originalSize; return false; } });
  } catch {
    return MALFORMED;
  }
  if (declared > IMPORT_LIMITS.expandedBytes) return EXPANDED;

  let actual = 0;
  let exceeded = false;
  let failed = false;
  const unzip = new Unzip((file) => {
    file.ondata = (error, chunk) => {
      if (error) { failed = true; return; }
      actual += chunk.length;
      if (actual > IMPORT_LIMITS.expandedBytes && !exceeded) {
        exceeded = true;
        file.terminate();
      }
    };
    try { file.start(); } catch { failed = true; }
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(bytes, true);
  } catch {
    if (!exceeded) failed = true;
  }
  if (exceeded) return EXPANDED;
  return failed ? MALFORMED : null;
}

type RichText = { richText: { text: string }[] };
const isRichText = (value: unknown): value is RichText =>
  typeof value === "object" && value !== null && Array.isArray((value as RichText).richText);
const richText = (value: RichText) => value.richText.map((part) => part.text ?? "").join("");

/**
 * Reads one cell without evaluating formulas or following hyperlinks. Numbers become decimal text,
 * so a phone stored as a number (missing its leading zero) still normalizes. Formulas, dates,
 * errors, and booleans are kept as problems.
 */
export function toCell(cell: ExcelJS.Cell): CellValue {
  // Merged cells repeat the master's value; only the master holds it.
  if (cell.isMerged && cell.master !== cell) return "";
  const value: unknown = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : { problem: "unsupported" };
  if (value instanceof Date) return { problem: "date" };
  if (typeof value !== "object") return { problem: "unsupported" };
  if ("formula" in value || "sharedFormula" in value) return { problem: "formula" };
  if ("error" in value) return { problem: "error" };
  if (isRichText(value)) return richText(value);
  if ("hyperlink" in value || "text" in value) {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text;
    if (isRichText(text)) return richText(text);
    return "";
  }
  return { problem: "unsupported" };
}

const isBlank = (cell: CellValue) => typeof cell === "string" && !cell.trim();

/**
 * Parses one visible worksheet (the first by default) into nonblank records numbered by their
 * actual worksheet row.
 */
export async function parseXlsx(bytes: Uint8Array, sheetName: string | null): Promise<ParseResult> {
  const expansion = checkExpansion(bytes);
  if (expansion) return { ok: false, error: expansion };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer as never);
  } catch {
    return { ok: false, error: MALFORMED };
  }
  const visible = workbook.worksheets.filter((sheet) => (sheet.state ?? "visible") === "visible");
  if (visible.length === 0) return { ok: false, error: { code: "empty", message: "The workbook has no visible worksheets." } };
  const sheet = (sheetName && visible.find((candidate) => candidate.name === sheetName)) || visible[0];

  const records: SourceRecord[] = [];
  let error: ParseError | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (error) return;
    const cells: CellValue[] = [];
    for (let column = 1; column <= row.cellCount; column++) cells.push(toCell(row.getCell(column)));
    while (cells.length > 0 && isBlank(cells[cells.length - 1])) cells.pop();
    if (cells.length === 0) return;
    if (cells.length > IMPORT_LIMITS.columns) {
      error = { code: "too_many_columns", message: `Row ${rowNumber} uses ${cells.length} columns. Worksheets can have at most ${IMPORT_LIMITS.columns} columns.` };
      return;
    }
    if (records.length >= MAX_PARSED_RECORDS) {
      error = { code: "too_many_rows", message: `The worksheet has more than ${IMPORT_LIMITS.rows.toLocaleString("en")} rows. Split it into smaller files.` };
      return;
    }
    records.push({ sourceRow: rowNumber, cells });
  });
  if (error) return { ok: false, error };
  if (records.length === 0) return { ok: false, error: { code: "empty", message: `The worksheet “${sheet.name}” has no rows.` } };
  return {
    ok: true,
    source: { format: "xlsx", sheets: visible.map((candidate) => candidate.name), sheet: sheet.name, records, columns: null },
  };
}
