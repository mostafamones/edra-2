import Papa from "papaparse";

import { IMPORT_LIMITS, MAX_PARSED_RECORDS } from "../limits";
import type { ParseResult, SourceRecord } from "../types";
import { decodeText } from "./text";

/**
 * Parses CSV text into nonblank records. Quoted fields, embedded newlines, and comma, semicolon,
 * tab, or pipe delimiters are supported; every value stays a string. Record numbers count every
 * record, including blank ones, so they match what staff see in a spreadsheet.
 */
export function parseCsv(bytes: Uint8Array): ParseResult {
  const decoded = decodeText(bytes);
  if (!decoded.ok) return decoded;
  // Guess the delimiter while ignoring blank lines, then parse every record so numbering counts blanks too.
  const { delimiter } = Papa.parse<string[]>(decoded.text, {
    preview: 50, skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"],
  }).meta;
  const result = Papa.parse<string[]>(decoded.text, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    delimiter: delimiter || ",",
  });
  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    return {
      ok: false,
      error: { code: "malformed", message: `The file has an unclosed or misplaced quote near record ${(quoteError.row ?? 0) + 1}. Fix it and try again.` },
    };
  }

  const records: SourceRecord[] = [];
  for (const [index, cells] of result.data.entries()) {
    if (!Array.isArray(cells) || cells.every((cell) => !cell.trim())) continue;
    if (cells.length > IMPORT_LIMITS.columns) {
      return { ok: false, error: { code: "too_many_columns", message: `Record ${index + 1} has ${cells.length} columns. Files can have at most ${IMPORT_LIMITS.columns} columns.` } };
    }
    if (records.length >= MAX_PARSED_RECORDS) {
      return { ok: false, error: { code: "too_many_rows", message: `The file has more than ${IMPORT_LIMITS.rows.toLocaleString("en")} rows. Split it into smaller files.` } };
    }
    records.push({ sourceRow: index + 1, cells });
  }
  if (records.length === 0) return { ok: false, error: { code: "empty", message: "The file has no rows." } };
  return { ok: true, source: { format: "csv", sheets: [], sheet: null, records, columns: null } };
}
