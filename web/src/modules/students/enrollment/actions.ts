"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { studentInviteHref } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

import { PENDING_STUDENT_INVITE_COOKIE, parsePendingStudentEntry, pendingStudentInviteCookie } from "./pending";
import {
  enrollmentSettingsSchema, isStudentInviteToken, isTerminalJoinState, parseStudentJoinState,
  type EnrollmentSettings, type StudentJoinState,
} from "./types";

type SettingsResult = { ok: true; settings: EnrollmentSettings } | { ok: false; error: "forbidden" | "unavailable" };

// The student's level is bound to the account, so only a track and optional group are chosen.
const choiceSchema = z.object({
  trackId: z.guid().nullable(),
  groupId: z.guid().nullable(),
}).strict().nullable();

/** The pending entry, clearing a malformed value. */
async function pendingEntry() {
  const store = await cookies();
  const entry = parsePendingStudentEntry(store.get(PENDING_STUDENT_INVITE_COOKIE)?.value);
  if (entry === "invalid") store.delete({ name: PENDING_STUDENT_INVITE_COOKIE, path: "/" });
  return { store, entry };
}

/** Re-reads the pending invite or booking entry, e.g. after a failed or outdated completion. */
export async function previewStudentInvite(): Promise<StudentJoinState> {
  const { store, entry } = await pendingEntry();
  if (!entry) return { kind: "none" };
  if (entry === "invalid") return { kind: "invalid" };
  const db = await createClient();
  const { data, error } = entry.kind === "booking"
    ? await db.rpc("preview_student_booking_entry", { p_token: entry.token })
    : await db.rpc("preview_student_invite", { p_token: entry.token });
  const state = error ? { kind: "error" as const } : parseStudentJoinState(data);
  if (isTerminalJoinState(state)) store.delete({ name: PENDING_STUDENT_INVITE_COOKIE, path: "/" });
  return state;
}

/**
 * Connects the existing record (choice = null) or enrolls with the chosen track (where the level has tracks) and group.
 * The database rechecks the entry authority and every rule at commit time.
 */
export async function completeStudentInvite(choice: unknown): Promise<StudentJoinState> {
  const parsed = choiceSchema.safeParse(choice);
  if (!parsed.success) return { kind: "error" };
  const { store, entry } = await pendingEntry();
  if (!entry) return { kind: "none" };
  if (entry === "invalid") return { kind: "invalid" };
  const args = {
    p_token: entry.token,
    // The generator types RPC arguments as non-null; the database accepts nulls here.
    // Explicit nulls: an undefined argument is dropped from the request and the function is not found.
    p_track_id: (parsed.data?.trackId ?? null) as string,
    p_group_id: (parsed.data?.groupId ?? null) as string,
  };
  const db = await createClient();
  const { data, error } = entry.kind === "booking"
    ? await db.rpc("complete_student_booking_entry", args)
    : await db.rpc("complete_student_invite", args);
  if (error) return { kind: "error" };
  const state = parseStudentJoinState(data);
  if (isTerminalJoinState(state)) store.delete({ name: PENDING_STUDENT_INVITE_COOKIE, path: "/" });
  return state;
}

/** Records an invite token pasted by a signed-in student, as opening the invite link would. */
export async function openStudentInviteLink(token: unknown): Promise<{ ok: true } | { ok: false }> {
  if (!isStudentInviteToken(token)) return { ok: false };
  (await cookies()).set(PENDING_STUDENT_INVITE_COOKIE, token, pendingStudentInviteCookie);
  return { ok: true };
}

export async function clearStudentInvite() {
  (await cookies()).delete({ name: PENDING_STUDENT_INVITE_COOKIE, path: "/" });
}

async function settingsResult(call: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<SettingsResult> {
  try {
    const { data, error } = await call;
    if (error) return { ok: false, error: error.message === "forbidden" ? "forbidden" : "unavailable" };
    const { inviteToken, ...rest } = enrollmentSettingsSchema.parse(data);
    return { ok: true, settings: { ...rest, link: inviteToken ? studentInviteHref(inviteToken) : null } };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function getStudentEnrollmentSettings(academyId: string): Promise<SettingsResult> {
  if (!z.guid().safeParse(academyId).success) return { ok: false, error: "forbidden" };
  return settingsResult((await createClient()).rpc("get_student_enrollment_settings", { p_academy_id: academyId }));
}

export async function updateStudentEnrollmentSettings(academyId: string, value: unknown): Promise<SettingsResult> {
  const parsed = z.object({ enrollmentOpen: z.boolean() }).safeParse(value);
  if (!z.guid().safeParse(academyId).success || !parsed.success) return { ok: false, error: "forbidden" };
  return settingsResult((await createClient()).rpc("update_student_enrollment_settings", {
    p_academy_id: academyId, p_enrollment_open: parsed.data.enrollmentOpen,
  }));
}

/** active = true issues a new link (replacing the current one); false turns the link off. */
export async function setStudentInvite(academyId: string, active: boolean): Promise<SettingsResult> {
  if (!z.guid().safeParse(academyId).success || typeof active !== "boolean") return { ok: false, error: "forbidden" };
  return settingsResult((await createClient()).rpc("set_student_invite", { p_academy_id: academyId, p_active: active }));
}
