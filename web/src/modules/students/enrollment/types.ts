import { z } from "zod";

/** 32 random bytes in base64url. Matches the database check on student invite tokens. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isStudentInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

const academySchema = z.object({ id: z.guid(), name: z.string(), slug: z.string(), icon: z.string() });

const slotSchema = z.object({ weekday: z.number().int(), startsAt: z.string(), location: z.string().nullable() });

const groupSchema = z.object({ id: z.guid(), name: z.string(), full: z.boolean(), seatsLeft: z.number().int().nullable(), slots: z.array(slotSchema) });

const programSchema = z.object({
  levelId: z.string(),
  levelName: z.string(),
  trackId: z.guid().nullable(),
  trackName: z.string().nullable(),
  groups: z.array(groupSchema),
});

const studentSchema = z.object({
  fullName: z.string(),
  levelName: z.string().nullable(),
  trackName: z.string().nullable(),
  groupName: z.string().nullable(),
});

const responseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("connected"), academy: academySchema }),
  z.object({ result: z.literal("existing"), academy: academySchema, student: studentSchema }),
  z.object({ result: z.literal("enroll"), academy: academySchema, returning: z.boolean(), programs: z.array(programSchema) }),
  z.object({ result: z.literal("staff_help"), academy: academySchema, reason: z.enum(["archived", "conflict", "details"]) }),
  z.object({ result: z.enum(["closed", "unavailable", "level_unavailable", "group_full", "invalid_choice", "changed"]), academy: academySchema }),
  z.object({ result: z.enum(["invalid", "unverified", "setup_required", "unauthenticated"]) }),
]);

export type EnrollmentProgram = z.infer<typeof programSchema>;
export type EnrollmentAcademy = z.infer<typeof academySchema>;

/** Renames each response variant's `result` to `kind`. */
type AsState<R> = R extends { result: infer K } ? Omit<R, "result"> & { kind: K } : never;

/** What academy onboarding may show. `none` means no pending invite; `error` a failed request. */
export type StudentJoinState = { kind: "none" } | { kind: "error" } | AsState<z.infer<typeof responseSchema>>;

export function parseStudentJoinState(value: unknown): StudentJoinState {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) return { kind: "error" };
  const { result, ...rest } = parsed.data;
  return { kind: result, ...rest } as StudentJoinState;
}

/** States after which the pending invite cannot lead anywhere and is cleared. */
export function isTerminalJoinState(state: StudentJoinState) {
  return state.kind === "connected" || state.kind === "invalid";
}

export const enrollmentSettingsSchema = z.object({
  enrollmentOpen: z.boolean(),
  inviteToken: z.string().nullable(),
  canManage: z.boolean(),
});

export type EnrollmentSettings = Omit<z.infer<typeof enrollmentSettingsSchema>, "inviteToken"> & { link: string | null };

export const studentAcademySchema = z.object({
  academy: academySchema,
  startYear: z.number().nullable(),
  access: z.enum(["active", "suspended", "no_current_year"]),
  record: z.object({
    fullName: z.string(),
    levelName: z.string().nullable(),
    trackName: z.string().nullable(),
    groupName: z.string().nullable(),
    participationType: z.enum(["in_person", "online_only"]),
  }).nullable(),
});

export type StudentAcademy = z.infer<typeof studentAcademySchema>;
