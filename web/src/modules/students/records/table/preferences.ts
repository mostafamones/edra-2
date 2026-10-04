import { PAGE_SIZES, type PageSize } from "../list-params";
import {
  ALWAYS_VISIBLE, clampWidth, DATA_COLUMNS, DEFAULT_VISIBILITY, isDataColumn, type DataColumnId,
} from "./config";

/**
 * Per-user, per-academy table layout kept in localStorage. Only layout is stored, never student data.
 * Bump the version when the stored shape changes; older entries are then ignored.
 */
export const PREFERENCES_VERSION = 1;

export type TableLayout = {
  order: DataColumnId[];
  visibility: Record<DataColumnId, boolean>;
  /** Widths the user has changed; columns without an entry use their default width. */
  sizing: Partial<Record<DataColumnId, number>>;
};

export type TablePreferences = TableLayout & { pageSize: PageSize | null };

export const preferencesKey = (userId: string, academyId: string) =>
  `edra.students.table.v${PREFERENCES_VERSION}:${userId}:${academyId}`;

export const defaultLayout = (): TableLayout => ({
  order: [...DATA_COLUMNS],
  visibility: { ...DEFAULT_VISIBILITY },
  sizing: {},
});

export const defaultPreferences = (): TablePreferences => ({ ...defaultLayout(), pageSize: null });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Turns whatever was stored into valid preferences: unknown and duplicate columns are dropped,
 * missing columns are appended in default order, widths are clamped, and bad values fall back.
 */
export function sanitizePreferences(raw: unknown): TablePreferences {
  const result = defaultPreferences();
  if (!isRecord(raw)) return result;

  if (Array.isArray(raw.order)) {
    const order = [...new Set(raw.order.filter(isDataColumn))];
    result.order = [...order, ...DATA_COLUMNS.filter((id) => !order.includes(id))];
  }
  if (isRecord(raw.visibility)) {
    for (const id of DATA_COLUMNS) {
      const visible = raw.visibility[id];
      if (typeof visible === "boolean") result.visibility[id] = visible;
    }
  }
  for (const id of ALWAYS_VISIBLE) result.visibility[id] = true;
  if (isRecord(raw.sizing)) {
    for (const [id, width] of Object.entries(raw.sizing)) {
      if (isDataColumn(id) && typeof width === "number" && Number.isFinite(width)) result.sizing[id] = clampWidth(id, width);
    }
  }
  if (typeof raw.pageSize === "number" && (PAGE_SIZES as readonly number[]).includes(raw.pageSize)) {
    result.pageSize = raw.pageSize as PageSize;
  }
  return result;
}

export function readPreferences(storage: Pick<Storage, "getItem">, key: string): TablePreferences {
  try {
    const stored = storage.getItem(key);
    return stored ? sanitizePreferences(JSON.parse(stored)) : defaultPreferences();
  } catch {
    return defaultPreferences();
  }
}

export function writePreferences(storage: Pick<Storage, "setItem">, key: string, preferences: TablePreferences) {
  try {
    storage.setItem(key, JSON.stringify(preferences));
  } catch {
    // Storage may be full or disabled; the layout still works for this visit.
  }
}

/** Moves a column one place left or right in the data-column order. */
export function moveColumn(order: DataColumnId[], id: DataColumnId, direction: -1 | 1): DataColumnId[] {
  const from = order.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
