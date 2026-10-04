import { IMPORT_LIMITS } from "../limits";
import type { CellValue, ParseResult, SourceColumn, SourceRecord } from "../types";
import { decodeText } from "./text";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function toCell(value: unknown): CellValue {
  if (value === undefined) return "";
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : { problem: "unsupported" };
  if (typeof value === "object") return { problem: "nested" };
  return { problem: "unsupported" };
}

const isBlank = (cell: CellValue) => cell === null || (typeof cell === "string" && !cell.trim());

/**
 * Parses a top-level array of flat objects. The union of keys becomes the columns; rows keep their
 * 1-based array position. Strings, numbers, and null are values; nested or other values are kept as
 * problems that block a row only when their column is mapped. Objects with no values are skipped.
 */
export function parseJson(bytes: Uint8Array): ParseResult {
  const decoded = decodeText(bytes);
  if (!decoded.ok) return decoded;
  let data: unknown;
  try {
    data = JSON.parse(decoded.text);
  } catch {
    return { ok: false, error: { code: "malformed", message: "The file isn’t valid JSON. Check it and try again." } };
  }
  if (!Array.isArray(data)) {
    return { ok: false, error: { code: "malformed", message: "The JSON must be an array of student objects, like [{ \"full_name\": … }]." } };
  }

  const keys: string[] = [];
  const keyIndex = new Map<string, number>();
  const items: { position: number; item: Record<string, unknown> }[] = [];
  for (const [index, item] of data.entries()) {
    if (!isPlainObject(item)) {
      return { ok: false, error: { code: "malformed", message: `Item ${index + 1} isn’t an object. Every array item must be one student.` } };
    }
    for (const key of Object.keys(item)) {
      if (keyIndex.has(key)) continue;
      if (keys.length >= IMPORT_LIMITS.columns) {
        return { ok: false, error: { code: "too_many_columns", message: `The items use more than ${IMPORT_LIMITS.columns} different keys.` } };
      }
      keyIndex.set(key, keys.length);
      keys.push(key);
    }
    items.push({ position: index + 1, item });
  }

  const records: SourceRecord[] = [];
  for (const { position, item } of items) {
    const cells = keys.map((key) => toCell(item[key]));
    if (cells.every(isBlank)) continue;
    if (records.length >= IMPORT_LIMITS.rows) {
      return { ok: false, error: { code: "too_many_rows", message: `The file has more than ${IMPORT_LIMITS.rows.toLocaleString("en")} students. Split it into smaller files.` } };
    }
    records.push({ sourceRow: position, cells });
  }
  if (records.length === 0) return { ok: false, error: { code: "empty", message: "The file has no students." } };
  const columns: SourceColumn[] = keys.map((key, index) => ({ id: `k${index}`, label: key }));
  return { ok: true, source: { format: "json", sheets: [], sheet: null, records, columns } };
}
