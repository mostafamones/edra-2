import type { Group } from "@/modules/groups";
import type { StudentListParams } from "../list-params";
import type { RecordVersion, StudentRecordRow } from "../types";

/**
 * Selected records keyed by id. Each entry keeps the version and status last seen, so a selection
 * that spans pages can still build archive/restore targets for rows that are no longer loaded.
 */
export type Selection = Record<string, {
  version: number; archived: boolean; suspended: boolean; revision: number; levelId: string; trackId: string | null;
}>;

const entry = (row: StudentRecordRow) => ({
  version: row.version, archived: Boolean(row.archivedAt), suspended: row.manuallySuspended, revision: row.suspensionRevision,
  levelId: row.levelId, trackId: row.trackId,
});

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

/** What a selection belongs to: changing any of it clears the selection, so hidden records are never acted on. Paging and sorting keep it. */
export const selectionScope = (params: StudentListParams, userId: string | undefined, academicYearId: string | null | undefined) => JSON.stringify([
  userId, academicYearId, params.search, params.status, params.levelId, params.track, params.group, params.participationType, params.labels, params.unlabeled, params.access,
]);

/** Refreshes versions and statuses for selected rows that were just reloaded. */
export function syncSelection(selection: Selection, rows: StudentRecordRow[]): Selection {
  let changed = false;
  const next = { ...selection };
  for (const row of rows) {
    const current = next[row.id];
    if (!current) continue;
    const fresh = entry(row);
    if (JSON.stringify(current) !== JSON.stringify(fresh)) {
      next[row.id] = fresh;
      changed = true;
    }
  }
  return changed ? next : selection;
}

/**
 * Whether one active group can take every selected student, as last seen: none archived, all in one
 * level, and a group of that level that is level-wide or has the track every one of them has.
 */
export function hasSharedGroup(selection: Selection, groups: Pick<Group, "level_id" | "track_id" | "archived_at">[]) {
  const entries = Object.values(selection);
  if (entries.length === 0 || entries.some((value) => value.archived)) return false;
  const levels = new Set(entries.map((value) => value.levelId));
  const tracks = new Set(entries.map((value) => value.trackId));
  const [level] = levels;
  const [track] = tracks;
  return levels.size === 1 && groups.some((group) => !group.archived_at && group.level_id === level
    && (group.track_id === null || (tracks.size === 1 && group.track_id === track)));
}

/** Suspension targets for the whole selection, as last seen. */
export const suspensionTargets = (selection: Selection) => Object.entries(selection)
  .map(([recordId, value]) => ({ recordId, revision: value.revision, suspended: value.suspended, archived: value.archived }));

/** Targets for a bulk action: active records to archive, or archived records to restore. */
export function bulkTargets(selection: Selection, archive: boolean): RecordVersion[] {
  return Object.entries(selection)
    .filter(([, value]) => value.archived !== archive)
    .map(([id, value]) => ({ id, version: value.version }));
}
