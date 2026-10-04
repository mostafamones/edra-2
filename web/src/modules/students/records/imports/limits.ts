const MiB = 1024 * 1024;

/** File limits. A file over any of them is rejected before any student record is created. */
export const IMPORT_LIMITS = {
  /** Nonblank data rows per file. */
  rows: 5000,
  fileBytes: 10 * MiB,
  columns: 100,
  /** Characters in one mapped cell. */
  cellLength: 2000,
  /** Uncompressed size of an XLSX package. */
  expandedBytes: 50 * MiB,
  /** Parsing gives up after this long. */
  parseTimeoutMs: 30_000,
  /** Rows and encoded bytes per staging request. */
  stageRows: 100,
  stageBytes: 256 * 1024,
  /** Rows created per import batch (fixed by the database at confirmation). */
  batchRows: 100,
} as const;

/** Nonblank records read before the header is chosen: a short preamble may precede the header. */
export const MAX_PARSED_RECORDS = IMPORT_LIMITS.rows + 100;
