"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { groupInputSchema } from "./validation";

type Result = { ok: true } | { ok: false; message: string };

async function manager(academyId: string) {
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (!auth?.claims) return null;
  const { data, error } = await db.from("academy_memberships")
    .select("role").eq("academy_id", academyId).eq("user_id", auth.claims.sub).single();
  if (error || !data || !["owner", "admin"].includes(data.role)) return null;
  return db;
}

export async function createGroup(value: unknown): Promise<Result> {
  const parsed = groupInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: "Check the group fields and try again." };
  const input = parsed.data;
  const db = await manager(input.academyId);
  if (!db) return { ok: false, message: "You do not have permission to create groups." };
  const { data: year, error: yearError } = await db.from("academic_years")
    .select("id").eq("academy_id", input.academyId).is("closed_at", null).single();
  if (yearError || !year) return { ok: false, message: "The active academic year is unavailable." };
  const { error } = await db.from("groups").insert({
    academy_id: input.academyId, academic_year_id: year.id,
    name: input.name, level_id: input.levelId, track_id: input.trackId,
    capacity: input.capacity, notes: input.notes,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/app/[academySlug]/groups", "page");
  return { ok: true };
}

export async function updateGroup(groupId: string, value: unknown): Promise<Result> {
  if (!z.uuid().safeParse(groupId).success) return { ok: false, message: "Invalid group." };
  const parsed = groupInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: "Check the group fields and try again." };
  const input = parsed.data;
  const db = await manager(input.academyId);
  if (!db) return { ok: false, message: "You do not have permission to edit groups." };
  const { data, error } = await db.from("groups").update({
    name: input.name, level_id: input.levelId, track_id: input.trackId,
    capacity: input.capacity, notes: input.notes,
  }).eq("id", groupId).eq("academy_id", input.academyId).is("archived_at", null).select("id").single();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Group not found." };
  revalidatePath("/app/[academySlug]/groups", "page");
  return { ok: true };
}

export async function archiveGroup(academyId: string, groupId: string): Promise<Result> {
  if (!z.uuid().safeParse(academyId).success || !z.uuid().safeParse(groupId).success)
    return { ok: false, message: "Invalid group." };
  const db = await manager(academyId);
  if (!db) return { ok: false, message: "You do not have permission to archive groups." };
  const { data, error } = await db.from("groups").update({ archived_at: new Date().toISOString() })
    .eq("id", groupId).eq("academy_id", academyId).is("archived_at", null).select("id").single();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Group not found." };
  revalidatePath("/app/[academySlug]/groups", "page");
  return { ok: true };
}

export async function restoreGroup(academyId: string, groupId: string): Promise<Result> {
  if (!z.uuid().safeParse(academyId).success || !z.uuid().safeParse(groupId).success)
    return { ok: false, message: "Invalid group." };
  const db = await manager(academyId);
  if (!db) return { ok: false, message: "You do not have permission to unarchive groups." };
  const { data, error } = await db.from("groups").update({ archived_at: null })
    .eq("id", groupId).eq("academy_id", academyId).not("archived_at", "is", null).select("id").single();
  // 23505: the active-name index already holds a group with this name in the same level and track.
  if (error?.code === "23505") return { ok: false, message: "An active group in this level already uses this name." };
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Group not found." };
  revalidatePath("/app/[academySlug]/groups", "page");
  return { ok: true };
}
