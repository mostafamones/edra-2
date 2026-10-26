"use server";

import { z } from "zod";

import { studentBookingHref } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

import { isStudentInviteToken } from "../enrollment/types";
import {
  bookingRegistrationsSchema, bookingSettingsSchema, parseBookingOutcome, REGISTRATIONS_PAGE_SIZE,
  type BookingOutcome, type BookingRegistrations, type BookingSettings,
} from "./types";
import { bookingSettingsInputSchema, bookingSubmissionSchema, submissionFieldErrors } from "./validation";

type SettingsError = "forbidden" | "stale" | "no_options" | "year_unavailable" | "unavailable";
type SettingsResult = { ok: true; settings: BookingSettings } | { ok: false; error: SettingsError };

/**
 * Record-only registration through the public form. The database derives the academy and year from
 * the live booking token, rechecks every choice and capacity, and never links an account.
 */
export async function submitStudentBooking(token: unknown, values: unknown): Promise<BookingOutcome> {
  if (!isStudentInviteToken(token)) return { result: "invalid" };
  const parsed = bookingSubmissionSchema.safeParse(values);
  if (!parsed.success) return { result: "validation", fieldErrors: submissionFieldErrors(parsed.error) };
  const input = parsed.data;
  try {
    const { data, error } = await (await createClient()).rpc("submit_student_booking", {
      p_token: token,
      p_year_id: input.yearId,
      p_revision: input.revision,
      p_retry_key: input.retryKey,
      p_full_name: input.fullName,
      p_student_phone: input.studentPhone,
      p_parent_phone: input.parentPhone,
      p_level_id: input.levelId,
      // The generator types RPC arguments as non-null; the database accepts nulls here.
      p_track_id: input.trackId as string,
      p_group_id: input.groupId as string,
      p_participation_type: input.participationType as string,
    });
    return error ? { result: "error" } : parseBookingOutcome(data);
  } catch {
    return { result: "error" };
  }
}

const SETTINGS_ERRORS: readonly string[] = ["forbidden", "stale", "no_options", "year_unavailable"];

async function settingsResult(call: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<SettingsResult> {
  try {
    const { data, error } = await call;
    if (error) return { ok: false, error: SETTINGS_ERRORS.includes(error.message) ? error.message as SettingsError : "unavailable" };
    const { token, ...rest } = bookingSettingsSchema.parse(data);
    return { ok: true, settings: { ...rest, link: token ? studentBookingHref(token) : null } };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** Every staff role may read the configuration and share the link. */
export async function getStudentBookingSettings(academyId: string): Promise<SettingsResult> {
  if (!z.guid().safeParse(academyId).success) return { ok: false, error: "forbidden" };
  return settingsResult((await createClient()).rpc("get_student_booking_settings", { p_academy_id: academyId }));
}

/** Owners, Head Admins and Admins save the open year's configuration against the revision they edited. */
export async function saveStudentBookingSettings(academyId: string, value: unknown): Promise<SettingsResult> {
  const parsed = bookingSettingsInputSchema.safeParse(value);
  if (!z.guid().safeParse(academyId).success || !parsed.success) return { ok: false, error: "forbidden" };
  const input = parsed.data;
  return settingsResult((await createClient()).rpc("save_student_booking_settings", {
    p_academy_id: academyId,
    p_academic_year_id: input.yearId,
    p_expected_revision: input.expectedRevision,
    p_open: input.open,
    p_allow_without_group: input.allowWithoutGroup,
    p_participation_mode: input.participationMode,
    p_excluded_level_ids: input.excludedLevelIds,
    p_excluded_track_ids: input.excludedTrackIds,
    p_excluded_group_ids: input.excludedGroupIds,
  }));
}

export async function listStudentBookingRegistrations(academyId: string, page: number): Promise<BookingRegistrations> {
  if (!z.guid().safeParse(academyId).success || !Number.isInteger(page) || page < 0) throw new Error("forbidden");
  const { data, error } = await (await createClient()).rpc("list_student_booking_registrations", {
    p_academy_id: academyId, p_offset: page * REGISTRATIONS_PAGE_SIZE, p_limit: REGISTRATIONS_PAGE_SIZE,
  });
  if (error) throw new Error(error.message === "forbidden" ? "forbidden" : "unavailable");
  return bookingRegistrationsSchema.parse(data);
}
