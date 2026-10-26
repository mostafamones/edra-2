import { z } from "zod";

import { academySchema, programSchema, slotSchema } from "../enrollment/types";

export const PARTICIPATION_MODES = ["in_person", "online_only", "choice"] as const;
export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];

/** What the public form may show. Never contains tokens, profile ids or staff configuration. */
const formResponseSchema = z.discriminatedUnion("result", [
  z.object({
    result: z.literal("open"),
    academy: academySchema,
    year: z.object({ id: z.guid(), startYear: z.number().int() }),
    revision: z.number().int(),
    groupOptional: z.boolean(),
    participation: z.enum(PARTICIPATION_MODES),
    programs: z.array(programSchema),
  }),
  z.object({ result: z.enum(["closed", "unavailable"]), academy: academySchema }),
  z.object({ result: z.literal("invalid") }),
]);

export type BookingForm = z.infer<typeof formResponseSchema> | { result: "error" };
export type OpenBookingForm = Extract<BookingForm, { result: "open" }>;

export function parseBookingForm(value: unknown): BookingForm {
  const parsed = formResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : { result: "error" };
}

export const BOOKING_FIELDS = ["fullName", "studentPhone", "parentPhone", "levelId", "trackId", "groupId", "participationType"] as const;
export type BookingField = (typeof BOOKING_FIELDS)[number];

const DATABASE_FIELDS: Record<string, BookingField> = {
  full_name: "fullName", student_phone: "studentPhone", parent_phone: "parentPhone", participation_type: "participationType",
};

const submitResponseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("registered"), academy: academySchema, receipt: z.object({ id: z.guid(), createdAt: z.string() }) }),
  z.object({ result: z.literal("validation"), field: z.string().nullish() }).passthrough(),
  z.object({
    result: z.enum(["already_registered", "closed", "unavailable", "changed", "invalid_choice", "group_full", "rate_limited", "staff_help", "continue"]),
  }).passthrough(),
  z.object({ result: z.literal("invalid") }).passthrough(),
]);

export type BookingOutcome =
  | { result: "registered"; receipt: { id: string; createdAt: string } }
  | { result: "validation"; fieldErrors: Partial<Record<BookingField, string>> }
  | { result: "already_registered" | "closed" | "unavailable" | "changed" | "invalid_choice" | "group_full" | "rate_limited" | "staff_help" | "continue" | "invalid" | "error" };

const FIELD_MESSAGES: Record<BookingField, string> = {
  fullName: "Enter the student’s name.",
  studentPhone: "Enter a valid Egyptian mobile number",
  parentPhone: "Enter a valid Egyptian mobile number",
  levelId: "Choose a level.",
  trackId: "Choose a track.",
  groupId: "Choose a group.",
  participationType: "Choose the student type.",
};

export function parseBookingOutcome(value: unknown): BookingOutcome {
  const parsed = submitResponseSchema.safeParse(value);
  if (!parsed.success) return { result: "error" };
  const data = parsed.data;
  if (data.result === "registered") return { result: "registered", receipt: data.receipt };
  if (data.result === "validation") {
    const field = data.field ? DATABASE_FIELDS[data.field] : undefined;
    return { result: "validation", fieldErrors: field ? { [field]: FIELD_MESSAGES[field] } : {} };
  }
  return { result: data.result };
}

const catalogSchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  tracks: z.array(z.object({ id: z.guid(), name: z.string() })),
  groups: z.array(z.object({
    id: z.guid(), name: z.string(), trackId: z.guid().nullable(), capacity: z.number().int().nullable(),
    seatsLeft: z.number().int().nullable(), slots: z.array(slotSchema),
  })),
}));

export const bookingSettingsSchema = z.object({
  token: z.string().nullable(),
  canManage: z.boolean(),
  year: z.object({ id: z.guid(), startYear: z.number().int() }).nullable(),
  catalog: catalogSchema,
  settings: z.object({
    open: z.boolean(),
    allowWithoutGroup: z.boolean(),
    participationMode: z.enum(PARTICIPATION_MODES),
    excludedLevelIds: z.array(z.string()),
    excludedTrackIds: z.array(z.guid()),
    excludedGroupIds: z.array(z.guid()),
    revision: z.number().int(),
  }),
});

export type BookingCatalog = z.infer<typeof catalogSchema>;
export type BookingConfiguration = z.infer<typeof bookingSettingsSchema>["settings"];
export type BookingSettings = Omit<z.infer<typeof bookingSettingsSchema>, "token"> & { link: string | null };

export const bookingRegistrationsSchema = z.object({
  total: z.number().int(),
  rows: z.array(z.object({
    recordId: z.guid(),
    fullName: z.string(),
    studentPhone: z.string(),
    levelName: z.string(),
    trackName: z.string().nullable(),
    groupName: z.string().nullable(),
    participationType: z.enum(["in_person", "online_only"]),
    entry: z.enum(["form", "onboarding"]),
    archived: z.boolean(),
    createdAt: z.string(),
  })),
});

export type BookingRegistrations = z.infer<typeof bookingRegistrationsSchema>;
export const REGISTRATIONS_PAGE_SIZE = 20;
