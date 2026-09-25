import { z } from "zod";

import { GLOBAL_LEVELS, globalLevelIdSchema } from "@/modules/academies/levels";
import { academySlugSchema } from "@/modules/academies/slug";

import { academyCreationCopy } from "./copy/academy-creation";

export { GLOBAL_LEVELS };

export type LevelId = (typeof GLOBAL_LEVELS)[number]["id"];

const trackSchema = z.object({
  id: z.string().min(1).max(80),
  levelId: globalLevelIdSchema,
  name: z.string().max(60),
});
const academyDraftBaseSchema = z.object({
  name: z.string().max(80),
  slug: z.string().max(50),
  icon: z.string(),
  subject: z.string().max(60),
  customSubject: z.boolean().default(false),
  levelIds: z.array(globalLevelIdSchema),
});

export const academyDraftSchema = academyDraftBaseSchema.extend({ tracks: z.array(trackSchema) });

const legacyProgramSchema = z.object({
  id: z.string(),
  levelId: globalLevelIdSchema,
  name: z.string(),
  groups: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});
const legacyAcademyDraftSchema = academyDraftBaseSchema.extend({ programs: z.array(legacyProgramSchema) });

export type AcademyDraft = z.infer<typeof academyDraftSchema>;
export type AcademyTrackDraft = AcademyDraft["tracks"][number];

export const EMPTY_ACADEMY_DRAFT: AcademyDraft = {
  name: "",
  slug: "",
  icon: "school",
  subject: "",
  customSubject: false,
  levelIds: [],
  tracks: [],
};

export function readAcademyDraft(value: string | null): AcademyDraft {
  if (!value) return EMPTY_ACADEMY_DRAFT;
  try {
    const raw: unknown = JSON.parse(value);
    const parsed = academyDraftSchema.safeParse(raw);
    if (parsed.success) return parsed.data;

    const legacy = legacyAcademyDraftSchema.safeParse(raw);
    if (!legacy.success) return EMPTY_ACADEMY_DRAFT;

    const { programs, ...draft } = legacy.data;
    return { ...draft, tracks: programs.map(({ id, levelId, name }) => ({ id, levelId, name })) };
  } catch {
    return EMPTY_ACADEMY_DRAFT;
  }
}

export function makeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function cleanSlugInput(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

export function identityErrors(draft: AcademyDraft) {
  const errors: Record<string, string> = {};
  if (draft.name.trim().length < 2) errors.name = academyCreationCopy.validation.academyNameRequired;
  else if (draft.name.trim().length > 80) errors.name = academyCreationCopy.validation.academyNameTooLong;
  return errors;
}

export function profileErrors(draft: AcademyDraft) {
  const errors: Record<string, string> = {};
  if (!academySlugSchema.safeParse(draft.slug).success) {
    errors.slug = academyCreationCopy.validation.slugFormat;
  }
  if (!draft.subject.trim()) errors.subject = academyCreationCopy.validation.subjectRequired;
  else if (draft.subject.trim().length > 60) errors.subject = academyCreationCopy.validation.subjectTooLong;
  return errors;
}

export function levelErrors(draft: AcademyDraft) {
  const errors: string[] = [];
  if (draft.levelIds.length === 0) errors.push(academyCreationCopy.levels.atLeastOneError);
  return errors;
}

export function trackErrors(draft: AcademyDraft) {
  const errors: string[] = [];
  if (draft.tracks.length > 100) errors.push(academyCreationCopy.tracks.tooManyError);
  for (const levelId of draft.levelIds) {
    const level = GLOBAL_LEVELS.find((item) => item.id === levelId);
    const tracks = draft.tracks.filter((track) => track.levelId === levelId);
    if (tracks.some((track) => !track.name.trim())) {
      errors.push(academyCreationCopy.tracks.nameRequiredError(level?.label ?? academyCreationCopy.tracks.fallbackLevel));
    }
    const names = tracks.map((track) => track.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      errors.push(academyCreationCopy.tracks.uniqueNamesError(level?.label ?? academyCreationCopy.tracks.fallbackGenericLevel));
    }
  }
  return [...new Set(errors)];
}
