import { z } from "zod";

export const GLOBAL_LEVEL_IDS = ["grade-9", "grade-10", "grade-11", "grade-12"] as const;

export type LevelId = (typeof GLOBAL_LEVEL_IDS)[number];

export const globalLevelIdSchema = z.enum(GLOBAL_LEVEL_IDS);

export const GLOBAL_LEVELS = [
  { id: "grade-9", label: "Grade 9" },
  { id: "grade-10", label: "Grade 10" },
  { id: "grade-11", label: "Grade 11" },
  { id: "grade-12", label: "Grade 12" },
] as const satisfies readonly { id: LevelId; label: string }[];
