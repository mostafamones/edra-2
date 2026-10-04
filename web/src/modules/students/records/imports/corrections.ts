import type { StudentRecordField } from "../types";
import {
  placementIssues, studentFormSchema, toNationalPhone, type PlacementContext, type StudentFormValues, type StudentRecordInput,
} from "../validation";
import type { CellValue, ImportField, ImportRow } from "./types";

/** The student form field each import field corrects. */
export const FORM_FIELDS: Record<ImportField, StudentRecordField> = {
  full_name: "fullName",
  student_phone: "studentPhone",
  parent_phone: "parentPhone",
  level: "levelId",
  track: "trackId",
  group: "primaryGroupId",
  student_type: "participationType",
};

const IMPORT_FIELDS = Object.fromEntries(Object.entries(FORM_FIELDS).map(([field, form]) => [form, field])) as Record<StudentRecordField, ImportField>;

export const cellText = (cell: CellValue | undefined) => (typeof cell === "string" ? cell : "");

/** A staged row as form values: resolved values first, the file's text where nothing resolved. */
export function rowFormValues(row: ImportRow): StudentFormValues {
  const input = row.input;
  return {
    fullName: input?.full_name ?? cellText(row.source.full_name),
    studentPhone: input?.student_phone ? toNationalPhone(input.student_phone) : cellText(row.source.student_phone),
    parentPhone: input?.parent_phone ? toNationalPhone(input.parent_phone) : cellText(row.source.parent_phone),
    levelId: input?.level_id ?? "",
    trackId: input?.track_id ?? "",
    primaryGroupId: input?.primary_group_id ?? "",
    participationType: input?.participation_type ?? "",
  };
}

export type FieldErrors = Partial<Record<ImportField, string>>;

/** Validates corrected values with the student form's rules; errors are keyed by import field. */
export function validateCorrection(
  values: StudentFormValues, scope: { academyId: string; academicYearId: string }, context: PlacementContext,
): { ok: true; input: StudentRecordInput } | { ok: false; errors: FieldErrors } {
  const result = studentFormSchema(scope, context).safeParse(values);
  if (result.success) return { ok: true, input: result.data };
  const errors: FieldErrors = {};
  // Placement checks only run once the fields pass, so add them here to report everything at once.
  const issues = [...result.error.issues, ...placementIssues(values, context).map((issue) => ({ path: [issue.path], message: issue.message }))];
  for (const issue of issues) {
    const field = IMPORT_FIELDS[issue.path[0] as StudentRecordField];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/**
 * The fields correction mode edits in place: those with an issue or a failed check, plus the
 * placement fields that depend on an edited level or track.
 */
export function editableFields(row: ImportRow, values: StudentFormValues, context: PlacementContext, errors?: FieldErrors) {
  const fields = new Set<ImportField>(row.issues.map((issue) => issue.field));
  for (const field of Object.keys(errors ?? {}) as ImportField[]) fields.add(field);
  if (fields.has("level")) {
    fields.add("group");
    if (context.tracks.some((track) => track.level_id === values.levelId)) fields.add("track");
  }
  if (fields.has("track")) fields.add("group");
  return fields;
}
