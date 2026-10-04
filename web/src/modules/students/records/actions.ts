"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";
import { loadGroupChangePreview, staffContext } from "./data";
import { failure, failureFromDatabase } from "./errors";
import {
  canArchiveStudentRecords, canChangeStudentGroups, canCreateStudentRecord, canEditStudentContact,
} from "./permissions";
import type { GroupChangePreview, RecordVersion, StudentRecordField, StudentRecordResult } from "./types";
import { studentRecordInputSchema, type StudentRecordInput } from "./validation";

type Functions = Database["public"]["Functions"];

/**
 * Supabase's generator types every RPC argument as non-null, but track and group are nullable
 * and validated by the database.
 */
function rpcArgs<Name extends "create_student_record" | "update_student_record">(
  args: { [K in keyof Functions[Name]["Args"]]: Functions[Name]["Args"][K] | null },
) {
  return args as Functions[Name]["Args"];
}

function parseInput(value: unknown) {
  const parsed = studentRecordInputSchema.safeParse(value);
  if (parsed.success) return { input: parsed.data } as const;
  const fieldErrors: Partial<Record<StudentRecordField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as StudentRecordField;
    if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { failure: failure("validation", fieldErrors) } as const;
}

const fields = (input: StudentRecordInput) => ({
  p_full_name: input.fullName,
  p_student_phone: input.studentPhone,
  p_parent_phone: input.parentPhone,
  p_level_id: input.levelId,
  p_track_id: input.trackId,
  p_primary_group_id: input.primaryGroupId,
  p_participation_type: input.participationType,
});

export async function createStudentRecord(value: unknown): Promise<StudentRecordResult<RecordVersion>> {
  const parsed = parseInput(value);
  if (parsed.failure) return parsed.failure;
  const { input } = parsed;
  const actor = await staffContext(input.academyId);
  if (!actor || !canCreateStudentRecord(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("create_student_record", rpcArgs<"create_student_record">({
      p_academy_id: input.academyId, p_academic_year_id: input.academicYearId, ...fields(input),
    }));
    if (error) return failureFromDatabase(error);
    const created = data?.[0];
    if (!created) return failure("unavailable");
    revalidatePath("/app/students");
    return { ok: true, data: { id: created.id, version: created.version } };
  } catch {
    return failure("unavailable");
  }
}

export async function updateStudentRecord(recordId: string, expectedVersion: number, value: unknown): Promise<StudentRecordResult<RecordVersion>> {
  if (!z.uuid().safeParse(recordId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return failure("not_found");
  const parsed = parseInput(value);
  if (parsed.failure) return parsed.failure;
  const { input } = parsed;
  const actor = await staffContext(input.academyId);
  // Instructor placement limits are enforced by update_student_record, which compares against the stored record.
  if (!actor || !canEditStudentContact(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("update_student_record", rpcArgs<"update_student_record">({
      p_record_id: recordId, p_expected_version: expectedVersion, p_academy_id: input.academyId, ...fields(input),
    }));
    if (error) return failureFromDatabase(error);
    const updated = data?.[0];
    if (!updated) return failure("not_found");
    revalidatePath("/app/students");
    return { ok: true, data: { id: updated.id, version: updated.version } };
  } catch {
    return failure("unavailable");
  }
}

const batchSchema = z.object({
  academyId: z.uuid(),
  academicYearId: z.uuid(),
  records: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() })).min(1).max(500),
  archived: z.boolean(),
});

/** Archives or restores records atomically: every target must be current, or nothing changes. */
export async function setStudentRecordsArchived(
  academyId: string, academicYearId: string, records: RecordVersion[], archived: boolean,
): Promise<StudentRecordResult<{ ids: string[] }>> {
  const parsed = batchSchema.safeParse({ academyId, academicYearId, records, archived });
  if (!parsed.success) return failure("validation");
  const actor = await staffContext(parsed.data.academyId);
  if (!actor || !canArchiveStudentRecords(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("set_student_records_archived", {
      p_academy_id: parsed.data.academyId,
      p_academic_year_id: parsed.data.academicYearId,
      p_records: parsed.data.records,
      p_archived: parsed.data.archived,
    });
    if (error) return failureFromDatabase(error);
    revalidatePath("/app/students");
    return { ok: true, data: { ids: data ?? [] } };
  } catch {
    return failure("unavailable");
  }
}

const groupScopeSchema = z.object({
  academyId: z.uuid(),
  academicYearId: z.uuid(),
  records: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() })).min(1).max(500)
    .refine((records) => new Set(records.map((record) => record.id)).size === records.length),
});

/**
 * Fresh current → proposed placements for the selected records. The selection only holds versions,
 * so placement is always read from the database. `destination` is a group id, null for Unassigned,
 * or undefined while none is chosen.
 */
export async function previewStudentGroupChange(
  scope: { academyId: string; academicYearId: string }, records: RecordVersion[], destination?: string | null,
): Promise<StudentRecordResult<GroupChangePreview>> {
  const parsed = groupScopeSchema.safeParse({ ...scope, records });
  if (!parsed.success || (destination != null && !z.uuid().safeParse(destination).success)) return failure("validation");
  const actor = await staffContext(parsed.data.academyId);
  if (!actor || !canChangeStudentGroups(actor.role)) return failure("forbidden");
  try {
    const preview = await loadGroupChangePreview(actor, parsed.data, parsed.data.records, destination);
    if (!preview) return failure("invalid_placement");
    return { ok: true, data: preview };
  } catch {
    return failure("unavailable");
  }
}

/**
 * Assigns the selected active records to one group, or removes their group when `primaryGroupId`
 * is null. All-or-nothing: every record must be current and, for a group, in its level and track.
 */
export async function setStudentRecordsGroup(
  scope: { academyId: string; academicYearId: string }, records: RecordVersion[], primaryGroupId: string | null,
): Promise<StudentRecordResult<{ changed: RecordVersion[]; unchanged: string[] }>> {
  const parsed = groupScopeSchema.safeParse({ ...scope, records });
  if (!parsed.success || (primaryGroupId !== null && !z.uuid().safeParse(primaryGroupId).success)) return failure("validation");
  const actor = await staffContext(parsed.data.academyId);
  if (!actor || !canChangeStudentGroups(actor.role)) return failure("forbidden");
  try {
    const { data, error } = await actor.db.rpc("set_student_records_group", {
      p_academy_id: parsed.data.academyId,
      p_academic_year_id: parsed.data.academicYearId,
      p_records: parsed.data.records,
      // NULL removes the group; the generator types the argument as non-null.
      p_primary_group_id: primaryGroupId as string,
    });
    if (error) return failureFromDatabase(error);
    const result = z.object({
      changed: z.array(z.object({ id: z.string(), version: z.number().int() })),
      unchanged: z.array(z.string()),
    }).parse(data);
    revalidatePath("/app/students");
    return { ok: true, data: result };
  } catch {
    return failure("unavailable");
  }
}
