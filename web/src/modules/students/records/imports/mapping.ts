import { IMPORT_LIMITS } from "./limits";
import {
  IMPORT_FIELDS, type CellValue, type ColumnMapping, type ImportDefaults, type ImportField, type ParsedSource,
  type SourceColumn, type SourceRecord, type StagedRow,
} from "./types";

export const FIELD_LABELS: Record<ImportField, string> = {
  full_name: "Full name",
  student_phone: "Student phone",
  parent_phone: "Parent phone",
  level: "Level",
  track: "Track",
  group: "Group",
  student_type: "Student type",
};

/** Normalizes a header for alias matching: NFKC, case-folded, separators as single spaces. */
export function normalizeHeader(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[_\-.:]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Common English and Arabic headers for each field. Matching is exact after normalization. */
const ALIASES: Record<ImportField, string[]> = {
  full_name: [
    "full name", "name", "student name", "student full name", "student",
    "الاسم", "اسم الطالب", "الاسم بالكامل", "الاسم الكامل", "اسم الطالب بالكامل", "الطالب",
  ],
  student_phone: [
    "student phone", "phone", "mobile", "student mobile", "phone number", "student phone number", "mobile number",
    "رقم الطالب", "هاتف الطالب", "موبايل الطالب", "رقم موبايل الطالب", "تليفون الطالب", "رقم الهاتف", "الموبايل", "رقم الموبايل",
  ],
  parent_phone: [
    "parent phone", "parent mobile", "guardian phone", "guardian mobile", "parent phone number", "father phone",
    "mother phone", "رقم ولي الأمر", "رقم ولي الامر", "هاتف ولي الأمر", "هاتف ولي الامر", "موبايل ولي الأمر",
    "موبايل ولي الامر", "تليفون ولي الأمر", "تليفون ولي الامر", "رقم الأب", "رقم الاب",
  ],
  level: ["level", "grade", "year", "school year", "الصف", "المرحلة", "المستوى", "السنة الدراسية", "الصف الدراسي"],
  track: ["track", "stream", "division", "branch", "الشعبة", "الشعبه", "المسار", "التخصص"],
  group: ["group", "class", "section", "group name", "المجموعة", "المجموعه", "الجروب", "الفصل"],
  student_type: [
    "student type", "type", "participation", "participation type", "attendance", "attendance type", "mode",
    "نوع الطالب", "النوع", "نظام الحضور", "طريقة الحضور",
  ],
};

const ALIAS_LOOKUP = new Map<string, ImportField>(
  IMPORT_FIELDS.flatMap((field) => [field, ...ALIASES[field]].map((alias) => [normalizeHeader(alias), field] as const)),
);

export const emptyMapping = (): ColumnMapping =>
  Object.fromEntries(IMPORT_FIELDS.map((field) => [field, null])) as ColumnMapping;

/** Finds the first likely header among introductory rows of a CSV or workbook. */
export function suggestHeaderIndex(source: ParsedSource): number {
  if (source.columns) return 0;
  let best = 0;
  let score = -1;
  for (let index = 0; index < Math.min(20, source.records.length); index++) {
    const matches = Object.values(suggestMapping(columnsFromHeader(source, index))).filter(Boolean).length;
    if (matches > score) { best = index; score = matches; }
  }
  return best;
}

/** Suggests a column for each field from known headers. Staff still review every suggestion. */
export function suggestMapping(columns: SourceColumn[]): ColumnMapping {
  const mapping = emptyMapping();
  for (const column of columns) {
    const field = ALIAS_LOOKUP.get(normalizeHeader(column.label));
    if (field && mapping[field] === null) mapping[field] = column.id;
  }
  return mapping;
}

export function unmappedColumns(columns: SourceColumn[], mapping: ColumnMapping): SourceColumn[] {
  const mapped = new Set(Object.values(mapping));
  return columns.filter((column) => !mapped.has(column.id));
}

const cellText = (cell: CellValue | undefined) => (typeof cell === "string" ? cell.trim() : "");

/** Columns named by a header record. Ids are positional, so duplicate headers stay distinct. */
export function columnsFromHeader(source: ParsedSource, headerIndex: number): SourceColumn[] {
  if (source.columns) return source.columns;
  const header = source.records[headerIndex]?.cells ?? [];
  const width = Math.max(0, ...source.records.slice(headerIndex).map((record) => record.cells.length));
  const columns: SourceColumn[] = [];
  const seen = new Map<string, number>();
  for (let index = 0; index < width; index++) {
    const text = cellText(header[index]);
    const base = text || `Column ${columnName(index)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    columns.push({ id: `c${index}`, label: count > 1 ? `${base} (${count})` : base });
  }
  return columns;
}

/** 0 → "A", 25 → "Z", 26 → "AA": the spreadsheet column name. */
export function columnName(index: number) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

/** The data records for a header choice: everything after the header, or every JSON item. */
export const dataRecords = (source: ParsedSource, headerIndex: number): SourceRecord[] =>
  source.columns ? source.records : source.records.slice(headerIndex + 1);

export type MappingProblem = { field: ImportField | null; message: string };

/** What must be fixed before a preview can be prepared. Defaults count for level and student type. */
export function mappingProblems(mapping: ColumnMapping, defaults: ImportDefaults): MappingProblem[] {
  const problems: MappingProblem[] = [];
  for (const field of ["full_name", "student_phone", "parent_phone"] as const) {
    if (!mapping[field]) problems.push({ field, message: `Choose the column for ${FIELD_LABELS[field].toLowerCase()}.` });
  }
  if (!mapping.level && !defaults.levelId) problems.push({ field: "level", message: "Choose the column for level." });
  if (!mapping.student_type && !defaults.participationType) {
    problems.push({ field: "student_type", message: "Choose the column for student type." });
  }
  const used = Object.values(mapping).filter(Boolean);
  if (new Set(used).size !== used.length) problems.push({ field: null, message: "Each column can fill only one field." });
  return problems;
}

export type BuildResult =
  | { ok: true; rows: StagedRow[] }
  | { ok: false; message: string };

/** Turns data records into staged rows for the mapped fields. Enforces the row and cell limits. */
export function buildStagedRows(source: ParsedSource, headerIndex: number, mapping: ColumnMapping): BuildResult {
  const columns = columnsFromHeader(source, headerIndex);
  const records = dataRecords(source, headerIndex);
  if (records.length === 0) return { ok: false, message: "The file has no data rows below the header." };
  if (records.length > IMPORT_LIMITS.rows) {
    return { ok: false, message: `The file has ${records.length.toLocaleString("en")} data rows. Import at most ${IMPORT_LIMITS.rows.toLocaleString("en")} rows per file.` };
  }
  const positions = new Map(columns.map((column, index) => [column.id, index]));
  const rows: StagedRow[] = [];
  for (const [index, record] of records.entries()) {
    const values: StagedRow["values"] = {};
    for (const field of IMPORT_FIELDS) {
      const columnId = mapping[field];
      if (!columnId) continue;
      const cell = record.cells[positions.get(columnId) ?? -1];
      if (cell === undefined) continue;
      if (typeof cell === "string") {
        const text = cell.trim();
        if (!text) continue;
        if (text.length > IMPORT_LIMITS.cellLength) {
          return { ok: false, message: `${rowLabel(source, record.sourceRow)} has a ${FIELD_LABELS[field].toLowerCase()} longer than ${IMPORT_LIMITS.cellLength.toLocaleString("en")} characters.` };
        }
        values[field] = text;
      } else {
        values[field] = cell;
      }
    }
    rows.push({ ordinal: index + 1, sourceRow: record.sourceRow, values });
  }
  return { ok: true, rows };
}

/** "Row 12" for CSV and XLSX, "Item 3" for JSON. */
export const rowLabel = (source: { format: ParsedSource["format"] }, sourceRow: number) =>
  `${source.format === "json" ? "Item" : "Row"} ${sourceRow}`;

/** The encoded size of a staging payload, as the server measures it. */
export const encodedSize = (rows: StagedRow[]) => new TextEncoder().encode(JSON.stringify(rows)).length;

/** Splits staged rows into sequential requests of at most 100 rows and 256 KiB. */
export function chunkStagedRows(rows: StagedRow[]): StagedRow[][] {
  const chunks: StagedRow[][] = [];
  let current: StagedRow[] = [];
  let size = 2;
  for (const row of rows) {
    const rowSize = new TextEncoder().encode(JSON.stringify(row)).length + 1;
    if (current.length > 0 && (current.length >= IMPORT_LIMITS.stageRows || size + rowSize > IMPORT_LIMITS.stageBytes)) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(row);
    size += rowSize;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
