import { z } from "zod";

import { phoneSchema } from "../../../lib/phone";
import type { EnrollmentProgram } from "../enrollment/types";
import { PARTICIPATION_TYPES, studentNameSchema } from "../records/validation";
import { PARTICIPATION_MODES, type BookingCatalog, type BookingField } from "./types";

const nullableId = z.union([z.guid(), z.literal(""), z.null()]).transform((value) => value || null);

/** The public submission. Academy, account and profile identities are never accepted from the browser. */
export const bookingSubmissionSchema = z.object({
  yearId: z.guid(),
  revision: z.number().int().positive(),
  retryKey: z.guid(),
  fullName: studentNameSchema,
  studentPhone: phoneSchema,
  parentPhone: phoneSchema,
  levelId: z.string().trim().min(1, "Choose a level.").max(64),
  trackId: nullableId,
  groupId: nullableId,
  participationType: z.union([z.enum(PARTICIPATION_TYPES), z.literal(""), z.null()]).transform((value) => value || null),
}).strict();

export type BookingSubmission = z.output<typeof bookingSubmissionSchema>;

export function submissionFieldErrors(error: z.ZodError): Partial<Record<BookingField, string>> {
  const errors: Partial<Record<BookingField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as BookingField;
    errors[field] ??= issue.message;
  }
  return errors;
}

export const bookingSettingsInputSchema = z.object({
  yearId: z.guid(),
  expectedRevision: z.number().int().min(0),
  open: z.boolean(),
  allowWithoutGroup: z.boolean(),
  participationMode: z.enum(PARTICIPATION_MODES),
  excludedLevelIds: z.array(z.string().min(1).max(64)).max(50),
  excludedTrackIds: z.array(z.guid()).max(200),
  excludedGroupIds: z.array(z.guid()).max(500),
}).strict();

export type BookingSettingsInput = z.output<typeof bookingSettingsInputSchema>;

/** Form values: selects hold "" when nothing is chosen. */
export type BookingValues = {
  fullName: string;
  studentPhone: string;
  parentPhone: string;
  levelId: string;
  trackId: string;
  groupId: string;
  participationType: string;
};

/** The levels offered by the form, in program order. */
export function bookingLevels(programs: EnrollmentProgram[]) {
  const levels = new Map<string, string>();
  for (const program of programs) if (!levels.has(program.levelId)) levels.set(program.levelId, program.levelName);
  return [...levels].map(([id, name]) => ({ id, name }));
}

/** Tracks offered for a level; empty when the level is booked without a track. */
export function bookingTracks(programs: EnrollmentProgram[], levelId: string) {
  return programs.filter((program) => program.levelId === levelId && program.trackId !== null)
    .map((program) => ({ id: program.trackId!, name: program.trackName ?? "" }));
}

/** The chosen program, once the level (and its track, where it has tracks) is chosen. */
export function bookingProgram(programs: EnrollmentProgram[], levelId: string, trackId: string) {
  if (!levelId) return null;
  const tracked = bookingTracks(programs, levelId).length > 0;
  return programs.find((program) => program.levelId === levelId && (tracked ? program.trackId === trackId : program.trackId === null)) ?? null;
}

/** The group select's explicit "no group" choice. */
export const NO_GROUP = "none";

/** Clears track and group choices the current form no longer offers, keeping everything else. */
export function keepAvailableChoices(values: BookingValues, form: { programs: EnrollmentProgram[]; groupOptional: boolean }): BookingValues {
  const { programs } = form;
  const levelId = bookingLevels(programs).some((level) => level.id === values.levelId) ? values.levelId : "";
  const trackId = bookingTracks(programs, levelId).some((track) => track.id === values.trackId) ? values.trackId : "";
  const program = bookingProgram(programs, levelId, trackId);
  const groupId = (values.groupId === NO_GROUP && form.groupOptional && program)
    || program?.groups.some((group) => group.id === values.groupId && !group.full) ? values.groupId : "";
  return { ...values, levelId, trackId, groupId };
}

/** The programs the public form would offer for these settings, mirroring edra_private.student_booking_programs. */
export function previewPrograms(catalog: BookingCatalog, settings: Pick<BookingSettingsInput, "allowWithoutGroup" | "excludedLevelIds" | "excludedTrackIds" | "excludedGroupIds">): EnrollmentProgram[] {
  const programs: EnrollmentProgram[] = [];
  for (const level of catalog) {
    const tracks = level.tracks.length > 0
      ? level.tracks.filter((track) => !settings.excludedTrackIds.includes(track.id))
      : settings.excludedLevelIds.includes(level.id) ? [] : [null];
    for (const track of tracks) {
      const groups = level.groups
        .filter((group) => !settings.excludedGroupIds.includes(group.id) && (group.trackId === null || group.trackId === track?.id))
        .map((group) => ({ id: group.id, name: group.name, full: group.seatsLeft === 0, seatsLeft: group.seatsLeft, slots: group.slots }));
      if (groups.length === 0 && !settings.allowWithoutGroup) continue;
      programs.push({ levelId: level.id, levelName: level.name, trackId: track?.id ?? null, trackName: track?.name ?? null, groups });
    }
  }
  return programs;
}
