import { z } from "zod";

import { phoneSchema } from "../../../lib/phone";

export const PARTICIPATION_TYPES = ["in_person", "online_only"] as const;
export type ParticipationType = (typeof PARTICIPATION_TYPES)[number];
export const PARTICIPATION_LABELS: Record<ParticipationType, string> = {
  in_person: "In person",
  online_only: "Online only",
};
export const isParticipationType = (value: unknown): value is ParticipationType =>
  PARTICIPATION_TYPES.includes(value as ParticipationType);

const nullableId = z.union([z.uuid(), z.literal(""), z.null()]).transform((value) => value || null);

const fullName = z.string().trim()
  .min(1, "Enter the student’s name.")
  .max(200, "Keep the name to 200 characters or fewer.");

/** The trusted shape the server actions accept. Placement compatibility is checked by the database. */
export const studentRecordInputSchema = z.object({
  academyId: z.uuid(),
  academicYearId: z.uuid(),
  fullName,
  studentPhone: phoneSchema,
  parentPhone: phoneSchema,
  levelId: z.string().trim().min(1, "Choose a level."),
  trackId: nullableId,
  primaryGroupId: nullableId,
  participationType: z.enum(PARTICIPATION_TYPES, { error: "Choose the student type." }),
});
export type StudentRecordInput = z.output<typeof studentRecordInputSchema>;

/** Raw form values: selects hold "" when nothing is chosen. */
export type StudentFormValues = {
  fullName: string;
  studentPhone: string;
  parentPhone: string;
  levelId: string;
  trackId: string;
  primaryGroupId: string;
  participationType: ParticipationType | "";
};

/** The academy structure the placement fields choose from. `groups` are the year's active groups. */
export type PlacementContext = {
  tracks: { id: string; level_id: string }[];
  groups: { id: string; level_id: string; track_id: string | null }[];
};

type Placement = { levelId: string; trackId: string; primaryGroupId: string };
type Issue = { path: "trackId" | "primaryGroupId"; message: string };

/** Track and group rules shared by the form; the database enforces the same rules on save. */
export function placementIssues(value: Placement, context: PlacementContext): Issue[] {
  if (!value.levelId) return [];
  const issues: Issue[] = [];
  const levelTracks = context.tracks.filter((track) => track.level_id === value.levelId);
  if (levelTracks.length > 0 && !value.trackId) issues.push({ path: "trackId", message: "Choose a track." });
  if (value.trackId && !levelTracks.some((track) => track.id === value.trackId))
    issues.push({ path: "trackId", message: "Choose a track offered for this level." });
  if (value.primaryGroupId && !isCompatibleGroup(value, context))
    issues.push({ path: "primaryGroupId", message: "Choose an active level-wide group or a group for this track." });
  return issues;
}

export function isCompatibleGroup(value: Placement, context: PlacementContext) {
  const group = context.groups.find((candidate) => candidate.id === value.primaryGroupId);
  return Boolean(group && isGroupCompatible(group, value.levelId, value.trackId));
}

/** A level-wide group (null track) fits any student of its level; a track group needs the same track. */
export function isGroupCompatible(group: { level_id: string; track_id: string | null }, levelId: string, trackId: string) {
  return group.level_id === levelId && (group.track_id === null || group.track_id === trackId);
}

/** Form schema that validates raw values and produces the action input for one academy and year. */
export function studentFormSchema(scope: { academyId: string; academicYearId: string }, context: PlacementContext) {
  return z.object({
    fullName,
    studentPhone: phoneSchema,
    parentPhone: phoneSchema,
    levelId: z.string().min(1, "Choose a level."),
    trackId: z.string(),
    primaryGroupId: z.string(),
    participationType: z.union([z.enum(PARTICIPATION_TYPES), z.literal("")], { error: "Choose the student type." })
      .refine(isParticipationType, "Choose the student type."),
  }).superRefine((value, ctx) => {
    for (const issue of placementIssues(value, context)) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }).transform((value): StudentRecordInput => ({
    ...scope,
    fullName: value.fullName,
    studentPhone: value.studentPhone,
    parentPhone: value.parentPhone,
    levelId: value.levelId,
    trackId: value.trackId || null,
    primaryGroupId: value.primaryGroupId || null,
    participationType: value.participationType as ParticipationType,
  }));
}

export function studentFormDefaults(record?: {
  fullName: string; studentPhone: string; parentPhone: string; levelId: string;
  trackId: string | null; primaryGroupId: string | null; participationType: ParticipationType;
}): StudentFormValues {
  if (!record) {
    return { fullName: "", studentPhone: "", parentPhone: "", levelId: "", trackId: "", primaryGroupId: "", participationType: "" };
  }
  return {
    fullName: record.fullName,
    studentPhone: toNationalPhone(record.studentPhone),
    parentPhone: toNationalPhone(record.parentPhone),
    levelId: record.levelId,
    trackId: record.trackId ?? "",
    primaryGroupId: record.primaryGroupId ?? "",
    participationType: record.participationType,
  };
}

/** "+201012345678" → "1012345678", what the phone input shows after its "+20" prefix. Unknown values pass through. */
export function toNationalPhone(canonical: string) {
  return /^\+20\d{10}$/.test(canonical) ? canonical.slice(3) : canonical;
}

/** "+201012345678" → "01012345678", the form most staff type. Unknown values pass through. */
export function toDomesticPhone(canonical: string) {
  return /^\+20\d{10}$/.test(canonical) ? `0${canonical.slice(3)}` : canonical;
}

/** "+201012345678" → "0101 234 5678" for display. */
export function formatPhone(canonical: string) {
  const domestic = toDomesticPhone(canonical);
  return /^0\d{10}$/.test(domestic) ? `${domestic.slice(0, 4)} ${domestic.slice(4, 7)} ${domestic.slice(7)}` : canonical;
}
