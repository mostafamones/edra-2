import { z } from "zod";

export const GLOBAL_LEVEL_IDS = [
  "preparatory-1",
  "preparatory-2",
  "preparatory-3",
  "secondary-1",
  "secondary-2",
  "secondary-3",
] as const;

export type LevelId = (typeof GLOBAL_LEVEL_IDS)[number];

export const globalLevelIdSchema = z.enum(GLOBAL_LEVEL_IDS);

export const GLOBAL_LEVELS = [
  { id: "preparatory-1", label: "First Preparatory" },
  { id: "preparatory-2", label: "Second Preparatory" },
  { id: "preparatory-3", label: "Third Preparatory" },
  { id: "secondary-1", label: "First Secondary" },
  { id: "secondary-2", label: "Second Secondary" },
  { id: "secondary-3", label: "Third Secondary" },
] as const satisfies readonly { id: LevelId; label: string }[];

/**
 * The approved conversion from the retired development catalog. Legacy ids survive only in immutable
 * history snapshots, resumable drafts and documented import aliases; they never become a placement.
 */
export const LEGACY_LEVEL_IDS = {
  "grade-9": "preparatory-3",
  "grade-10": "secondary-1",
  "grade-11": "secondary-2",
  "grade-12": "secondary-3",
} as const satisfies Record<string, LevelId>;

/** Returns the current id for a retired catalog id, and any other value unchanged. */
export function convertLegacyLevelId<T>(id: T): T | LevelId {
  return typeof id === "string" && Object.hasOwn(LEGACY_LEVEL_IDS, id)
    ? LEGACY_LEVEL_IDS[id as keyof typeof LEGACY_LEVEL_IDS]
    : id;
}

/** Display name for a stored level id, resolving retired ids to their replacement's name. */
export function levelLabel(id: string): string | undefined {
  const current = convertLegacyLevelId(id);
  return GLOBAL_LEVELS.find((level) => level.id === current)?.label;
}

/**
 * Import alias: a cell naming a retired level by its old code or display name ("grade-10", "Grade 10")
 * resolves to the approved replacement. It never creates a placement in a level the academy lacks.
 */
export function legacyLevelAlias(text: string): LevelId | undefined {
  const match = /^grade[\s_-]*(9|10|11|12)$/i.exec(text.trim());
  return match ? LEGACY_LEVEL_IDS[`grade-${match[1]}` as keyof typeof LEGACY_LEVEL_IDS] : undefined;
}
