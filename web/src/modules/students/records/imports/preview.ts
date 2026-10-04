import type { ImportRow, StagedRow } from "./types";

/** Displays parsed entries without treating browser-side values as validated student records. */
export function previewRow(row: StagedRow): ImportRow {
  return {
    ordinal: row.ordinal, sourceRow: row.sourceRow, source: row.values,
    corrected: false, input: null, issues: [], excluded: false, status: "invalid",
    existingArchived: null, duplicateRows: null, batchIndex: null, outcome: null,
    outcomeCode: null, recordId: null, levelName: null, trackName: null, groupName: null,
  };
}
