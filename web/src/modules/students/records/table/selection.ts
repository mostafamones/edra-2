import type { RecordVersion, StudentRecordRow } from "../types";

/**
 * Selected records keyed by id. Each entry keeps the version and status last seen, so a selection
 * that spans pages can still build archive/restore targets for rows that are no longer loaded.
 */
export type Selection = Record<string, { version: number; archived: boolean }>;

const entry = (row: StudentRecordRow) => ({ version: row.version, archived: Boolean(row.archivedAt) });

export function toggleRow(selection: Selection, row: StudentRecordRow, selected: boolean): Selection {
  const next = { ...selection };
  if (selected) next[row.id] = entry(row);
  else delete next[row.id];
  return next;
}

/** Selects or clears every row on the current page, keeping selections from other pages. */
export function togglePage(selection: Selection, rows: StudentRecordRow[], selected: boolean): Selection {
  const next = { ...selection };
  for (const row of rows) {
    if (selected) next[row.id] = entry(row);
    else delete next[row.id];
  }
  return next;
}

export function pageSelectionState(selection: Selection, rows: StudentRecordRow[]): boolean | "indeterminate" {
  const selected = rows.filter((row) => selection[row.id]).length;
  if (selected === 0) return false;
  return selected === rows.length ? true : "indeterminate";
}

/** Refreshes versions and statuses for selected rows that were just reloaded. */
export function syncSelection(selection: Selection, rows: StudentRecordRow[]): Selection {
  let changed = false;
  const next = { ...selection };
  for (const row of rows) {
    const current = next[row.id];
    if (!current) continue;
    const fresh = entry(row);
    if (current.version !== fresh.version || current.archived !== fresh.archived) {
      next[row.id] = fresh;
      changed = true;
    }
  }
  return changed ? next : selection;
}

/** Targets for a bulk action: active records to archive, or archived records to restore. */
export function bulkTargets(selection: Selection, archive: boolean): RecordVersion[] {
  return Object.entries(selection)
    .filter(([, value]) => value.archived !== archive)
    .map(([id, value]) => ({ id, version: value.version }));
}
