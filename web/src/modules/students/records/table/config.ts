import { SORT_FIELDS, type SortField } from "../list-params";

/** Data columns in their default order. Selection and actions stay pinned at the table edges. */
export const DATA_COLUMNS = ["code", ...SORT_FIELDS] as const;
export type DataColumnId = "code" | SortField;
/** The student code column exists only while the academy uses student codes, and is not sortable. */
export const CODE_COLUMN = "code" satisfies DataColumnId;
export const SELECT_COLUMN = "select";
export const ACTIONS_COLUMN = "actions";

export const COLUMN_LABELS: Record<DataColumnId, string> = {
  code: "Code",
  name: "Name",
  studentPhone: "Student phone",
  parentPhone: "Parent phone",
  level: "Level",
  track: "Track",
  group: "Group",
  participationType: "Participation",
  status: "Status",
  createdAt: "Created",
};

export const MAX_COLUMN_WIDTH = 720;
export const MIN_COLUMN_WIDTH = 100;
export const RESIZE_STEP = 10;

export const COLUMN_WIDTHS: Record<DataColumnId, { size: number; minSize: number; maxSize: number }> = {
  code: { size: 96, minSize: 72, maxSize: MAX_COLUMN_WIDTH },
  name: { size: 260, minSize: 180, maxSize: MAX_COLUMN_WIDTH },
  studentPhone: { size: 180, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  parentPhone: { size: 180, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  level: { size: 180, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  track: { size: 180, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  group: { size: 200, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  participationType: { size: 160, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  status: { size: 120, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
  createdAt: { size: 180, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
};
export const SELECT_WIDTH = 44;
export const ACTIONS_WIDTH = 48;

/** Columns that cannot be hidden. They can still be reordered. */
export const ALWAYS_VISIBLE: readonly DataColumnId[] = ["name"];

export const DEFAULT_VISIBILITY: Record<DataColumnId, boolean> = {
  code: true,
  name: true,
  studentPhone: true,
  parentPhone: true,
  level: true,
  track: true,
  group: true,
  participationType: true,
  status: true,
  createdAt: false,
};

export const isDataColumn = (id: unknown): id is DataColumnId =>
  typeof id === "string" && (DATA_COLUMNS as readonly string[]).includes(id);

export const clampWidth = (id: DataColumnId, width: number) =>
  Math.round(Math.min(COLUMN_WIDTHS[id].maxSize, Math.max(COLUMN_WIDTHS[id].minSize, width)));
