import type { ParticipationType } from "../validation";

export const IMPORT_FORMATS = ["csv", "json", "xlsx"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];
export const isImportFormat = (value: unknown): value is ImportFormat =>
  IMPORT_FORMATS.includes(value as ImportFormat);

/** The canonical import fields, in template order. */
export const IMPORT_FIELDS = [
  "full_name", "student_phone", "parent_phone", "level", "track", "group", "student_type",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Why a cell cannot be imported as a plain value. */
export const CELL_PROBLEMS = ["formula", "date", "error", "nested", "unsupported"] as const;
export type CellProblem = (typeof CELL_PROBLEMS)[number];

/**
 * One parsed source cell: text, JSON null (an explicit empty value), or a value that cannot be
 * imported. Blank cells are empty strings.
 */
export type CellValue = string | null | { problem: CellProblem };

/** A source column. Ids stay distinct even when two headers share a name. */
export type SourceColumn = { id: string; label: string };

/** A nonblank source record with where it came from (CSV record, worksheet row, or JSON position). */
export type SourceRecord = { sourceRow: number; cells: CellValue[] };

/** What the parser hands to the mapping step. */
export type ParsedSource = {
  format: ImportFormat;
  /** Visible worksheets, for XLSX; empty otherwise. */
  sheets: string[];
  sheet: string | null;
  records: SourceRecord[];
  /** JSON keys as columns. Null for CSV and XLSX, whose columns come from the chosen header record. */
  columns: SourceColumn[] | null;
};

export type ParseErrorCode =
  | "too_large" | "too_many_rows" | "too_many_columns" | "too_long" | "expanded_too_large"
  | "encoding" | "malformed" | "empty" | "timeout" | "unavailable";
export type ParseError = { code: ParseErrorCode; message: string };
export type ParseResult = { ok: true; source: ParsedSource } | { ok: false; error: ParseError };

/** Source column id per canonical field; null leaves the field unmapped. */
export type ColumnMapping = Record<ImportField, string | null>;

/** Session defaults, as ids chosen from the academy structure. Empty strings mean no default. */
export type ImportDefaults = {
  levelId: string;
  trackId: string;
  primaryGroupId: string;
  participationType: ParticipationType | "";
};

/** One mapped row sent for staging. Blank values are omitted. */
export type StagedRow = {
  ordinal: number;
  sourceRow: number;
  values: Partial<Record<ImportField, CellValue>>;
};

export type ImportState = "staging" | "reviewing" | "importing" | "completed" | "cancelled" | "blocked";
export const IMPORT_STATUSES = ["ready", "invalid", "duplicate_existing", "duplicate_file", "excluded"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const IMPORT_OUTCOMES = ["pending", "created", "skipped", "failed"] as const;
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number];
/** Row filters: a review status or an execution outcome. */
export type ImportRowFilter = ImportStatus | ImportOutcome;

/** A field-level problem found by server-side validation. */
export type ImportIssue = { field: ImportField; code: string; detail?: string };

/** The resolved create input for a row; fields are null where they could not be resolved. */
export type ImportRowInput = {
  full_name: string | null;
  student_phone: string | null;
  parent_phone: string | null;
  level_id: string | null;
  track_id: string | null;
  primary_group_id: string | null;
  participation_type: ParticipationType | null;
};

export type ImportRow = {
  ordinal: number;
  sourceRow: number;
  source: Partial<Record<ImportField, CellValue>>;
  corrected: boolean;
  input: ImportRowInput | null;
  issues: ImportIssue[];
  excluded: boolean;
  status: ImportStatus;
  existingArchived: boolean | null;
  duplicateRows: number[] | null;
  batchIndex: number | null;
  outcome: ImportOutcome | null;
  outcomeCode: string | null;
  recordId: string | null;
  levelName: string | null;
  trackName: string | null;
  groupName: string | null;
};

export type ImportCounts = Record<ImportStatus, number> & Record<ImportOutcome, number> & {
  /** Skipped rows by reason code. */
  skippedByCode: Record<string, number>;
  /** Rows assigned to batches at confirmation (the Ready rows). */
  batched: number;
  /** The first batch that still has pending rows, or null when none remain. */
  nextBatch: number | null;
};

export type ImportSession = {
  id: string;
  importNumber: number;
  createdBy: string;
  importedByName: string;
  academyId: string;
  academicYearId: string;
  fileName: string;
  format: ImportFormat;
  worksheet: string | null;
  expectedRows: number;
  stagedRows: number;
  defaults: Partial<Record<"level_id" | "track_id" | "primary_group_id" | "participation_type", string>>;
  state: ImportState;
  revision: number;
  batchCount: number | null;
  blockedReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
};

export type ImportSummary = ImportSession & { counts: ImportCounts };

export type ImportLog = ImportSession & { createdCount: number; skippedCount: number; failedCount: number };
export const importTitle = (number: number) => `Review Import #${String(number).padStart(3, "0")}`;

export type ImportRowsPage = { rows: ImportRow[]; total: number };

/** The stored outcome of one processed batch and the session's running totals. */
export type ImportBatchResult = {
  state: ImportState;
  blockedReason: string | null;
  created: number;
  skipped: number;
  failed: number;
  pending: number;
  nextBatch: number | null;
};
