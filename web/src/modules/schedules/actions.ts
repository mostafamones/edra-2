"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { canArchiveSchedule, canCreateSchedule, canEditSchedule } from "./permissions";
import { scheduleInputSchema, withinYear, type ScheduleInput } from "./validation";

type Functions = Database["public"]["Functions"];

/**
 * Supabase's generator types every RPC argument as non-null, but these functions accept NULL for
 * the fields that do not apply to a schedule's kind or audience and validate them in the database.
 */
function rpcArgs<Name extends "create_schedule" | "update_schedule">(args: { [K in keyof Functions[Name]["Args"]]: Functions[Name]["Args"][K] | null }) {
  return args as Functions[Name]["Args"];
}

type Result = { ok: true } | { ok: false; message: string };

const invalid = (error: z.ZodError): Result => ({ ok: false, message: error.issues[0]?.message ?? "Check the schedule fields." });

/** The signed-in user's id and role in the academy, or null when they are not a member. */
async function member(academyId: string) {
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return null;
  const { data } = await db.from("academy_memberships").select("role")
    .eq("academy_id", academyId).eq("user_id", auth.claims.sub).maybeSingle();
  return data ? { db, userId: auth.claims.sub, role: data.role } : null;
}

/** The active academic year, and whether every one-off session date falls inside it. */
async function activeYear(db: Awaited<ReturnType<typeof createClient>>, input: ScheduleInput) {
  const { data: year } = await db.from("academic_years").select("id,starts_on,ends_on")
    .eq("academy_id", input.academyId).is("closed_at", null).maybeSingle();
  if (!year?.starts_on || !year.ends_on) return { error: "The active academic year is unavailable." } as const;
  const bounds = { starts_on: year.starts_on, ends_on: year.ends_on };
  if (input.sessions.some((session) => !withinYear(session.date, bounds)))
    return { error: "Choose a date within the active academic year." } as const;
  return { id: year.id } as const;
}

const timing = (input: ScheduleInput) => ({
  p_title: input.title, p_audience: input.audience,
  p_group_id: input.groupId, p_level_id: input.levelId, p_track_id: input.trackId,
  p_mandatory: input.mandatory, p_location: input.location,
  p_slots: input.slots, p_sessions: input.sessions,
});

export async function createSchedule(value: unknown): Promise<Result> {
  const parsed = scheduleInputSchema.safeParse(value);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const actor = await member(input.academyId);
  if (!actor || !canCreateSchedule(actor.role, input.kind))
    return { ok: false, message: "You do not have permission to create this schedule." };
  const year = await activeYear(actor.db, input);
  if (year.error) return { ok: false, message: year.error };
  const { error } = await actor.db.rpc("create_schedule", rpcArgs<"create_schedule">({
    p_academy_id: input.academyId, p_academic_year_id: year.id, p_kind: input.kind, ...timing(input),
  }));
  if (error) return { ok: false, message: error.message };
  revalidatePath("/app/schedules");
  return { ok: true };
}

export async function updateSchedule(scheduleId: string, value: unknown): Promise<Result> {
  if (!z.uuid().safeParse(scheduleId).success) return { ok: false, message: "Invalid schedule." };
  const parsed = scheduleInputSchema.safeParse(value);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const actor = await member(input.academyId);
  if (!actor) return { ok: false, message: "You do not have permission to edit this schedule." };
  const { data: existing } = await actor.db.from("schedules").select("kind,archived_at")
    .eq("id", scheduleId).eq("academy_id", input.academyId).maybeSingle();
  if (!existing) return { ok: false, message: "Schedule not found." };
  if (existing.archived_at) return { ok: false, message: "Archived schedules cannot be edited." };
  if (existing.kind !== input.kind) return { ok: false, message: "A schedule's type cannot be changed." };
  if (!canEditSchedule(actor.role, existing)) return { ok: false, message: "You do not have permission to edit this schedule." };
  const year = await activeYear(actor.db, input);
  if (year.error) return { ok: false, message: year.error };
  const { data, error } = await actor.db.rpc("update_schedule", rpcArgs<"update_schedule">({
    p_schedule_id: scheduleId, p_academy_id: input.academyId, ...timing(input),
  }));
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Schedule not found." };
  revalidatePath("/app/schedules");
  return { ok: true };
}

export async function archiveSchedule(academyId: string, scheduleId: string): Promise<Result> {
  if (!z.uuid().safeParse(academyId).success || !z.uuid().safeParse(scheduleId).success)
    return { ok: false, message: "Invalid schedule." };
  const actor = await member(academyId);
  if (!actor) return { ok: false, message: "You do not have permission to archive this schedule." };
  const { data: schedule } = await actor.db.from("schedules").select("kind,archived_at,created_by")
    .eq("id", scheduleId).eq("academy_id", academyId).maybeSingle();
  if (!schedule) return { ok: false, message: "Schedule not found." };
  if (schedule.archived_at) return { ok: false, message: "This schedule is already archived." };
  if (!canArchiveSchedule(actor.role, schedule, actor.userId))
    return { ok: false, message: "You do not have permission to archive this schedule." };
  const { data, error } = await actor.db.from("schedules").update({ archived_at: new Date().toISOString() })
    .eq("id", scheduleId).eq("academy_id", academyId).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Schedule not found." };
  revalidatePath("/app/schedules");
  return { ok: true };
}
