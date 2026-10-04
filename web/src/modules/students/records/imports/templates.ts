import Papa from "papaparse";

import { PARTICIPATION_LABELS, PARTICIPATION_TYPES } from "../validation";
import { FIELD_LABELS } from "./mapping";
import { IMPORT_FIELDS, type ImportField, type ImportFormat } from "./types";

/** The academy's valid placement values, listed in the import instructions. */
export type ImportReference = {
  levels: { id: string; name: string }[];
  tracks: { id: string; levelId: string; levelName: string; name: string }[];
  groups: { name: string; levelId: string; trackId: string | null; levelName: string; trackName: string | null }[];
};

export const TEMPLATE_MIME: Record<ImportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const templateFileName = (format: ImportFormat) => `students-template.${format}`;

const FIELD_NOTES: Record<(typeof IMPORT_FIELDS)[number], string> = {
  full_name: "Required. Up to 200 characters.",
  student_phone: "Required. An Egyptian mobile number, unique among this year’s students.",
  parent_phone: "Required. An Egyptian mobile number; students may share one.",
  level: "Required unless you choose a default level. The level code or its name.",
  track: "Required when the level has tracks. The track name.",
  group: "Optional. The group name in the student’s level and track, or “Unassigned”.",
  student_type: `Required unless you choose a default type. ${PARTICIPATION_TYPES.map((type) => `“${PARTICIPATION_LABELS[type]}” (${type})`).join(" or ")}.`,
};

/** The instruction text shared by the import page and the XLSX Instructions worksheet. */
export function instructionLines(reference: ImportReference): string[][] {
  const lines: string[][] = [["Column", "What to enter"]];
  for (const field of IMPORT_FIELDS) lines.push([field, `${FIELD_LABELS[field]}. ${FIELD_NOTES[field]}`]);
  lines.push([], ["Example rows", "Replace the example names and masked phone numbers with your students’ details, or delete the example rows."]);
  lines.push([], ["Levels", "Code — Name"]);
  for (const level of reference.levels) lines.push(["", `${level.id} — ${level.name}`]);
  lines.push([], ["Tracks", "Level — Track"]);
  if (reference.tracks.length === 0) lines.push(["", "No level has tracks."]);
  for (const track of reference.tracks) lines.push(["", `${track.levelName} — ${track.name}`]);
  lines.push([], ["Groups", "Group — Level · Track"]);
  if (reference.groups.length === 0) lines.push(["", "No active groups this year. Leave the group column empty."]);
  for (const group of reference.groups) {
    lines.push(["", `${group.name} — ${group.levelName}${group.trackName ? ` · ${group.trackName}` : ""}`]);
  }
  lines.push([], ["Student types", PARTICIPATION_TYPES.map((type) => `${type} (${PARTICIPATION_LABELS[type]})`).join(", ")]);
  return lines;
}

/** One example per level/track, with a compatible group where available; no student data is read. */
export function templateExamples(reference: ImportReference): Record<ImportField, string>[] {
  const rows: Record<ImportField, string>[] = [];
  for (const level of reference.levels) {
    const tracks = reference.tracks.filter((track) => track.levelId === level.id);
    for (const track of tracks.length ? tracks : [null]) {
      const group = reference.groups.find((group) => group.levelId === level.id && group.trackId === (track?.id ?? null));
      rows.push({
        full_name: `Example student ${rows.length + 1}`,
        student_phone: "01XXXXXXXXX",
        parent_phone: "01XXXXXXXXX",
        level: level.name,
        track: track?.name ?? "",
        group: group?.name ?? "Unassigned",
        student_type: "in_person",
      });
    }
  }
  if (rows[0]) rows.push({ ...rows[0], full_name: `Example student ${rows.length + 1}`, group: "Unassigned", student_type: "online_only" });
  return rows;
}

/** The BOM preserves Arabic labels in Excel; escaping prevents spreadsheet formula execution. */
export const csvTemplate = (reference: ImportReference) =>
  `\uFEFF${Papa.unparse({ fields: [...IMPORT_FIELDS], data: templateExamples(reference).map((row) => IMPORT_FIELDS.map((field) => row[field])) }, { escapeFormulae: true, newline: "\r\n" })}\r\n`;

/** The same academy-specific examples as CSV and Excel, with phones kept as strings. */
export const jsonTemplate = (reference: ImportReference) =>
  `${JSON.stringify(templateExamples(reference), null, 2)}\n`;

/** A Students worksheet with headers and text-formatted phone columns, plus an Instructions worksheet. */
export async function xlsxTemplate(reference: ImportReference): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const students = workbook.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  students.columns = IMPORT_FIELDS.map((field) => ({ header: field, key: field, width: field === "full_name" ? 32 : 20 }));
  students.getRow(1).font = { bold: true };
  // Text format keeps leading zeros when staff type or paste phone numbers.
  for (const field of ["student_phone", "parent_phone"] as const) students.getColumn(field).numFmt = "@";
  for (const example of templateExamples(reference)) students.addRow(example);

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 18 }, { width: 90 }];
  for (const line of instructionLines(reference)) instructions.addRow(line);
  instructions.getRow(1).font = { bold: true };
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/** The template file contents for a format. */
export async function buildTemplate(format: ImportFormat, reference: ImportReference): Promise<BlobPart> {
  if (format === "csv") return csvTemplate(reference);
  if (format === "json") return jsonTemplate(reference);
  return xlsxTemplate(reference);
}
