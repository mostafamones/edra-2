import { z } from "zod";

import { GLOBAL_LEVEL_IDS, globalLevelIdSchema } from "./levels";
import { academySlugSchema } from "./slug";

export const createAcademySchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export type CreateAcademyInput = z.infer<typeof createAcademySchema>;

export const ACADEMY_ICON_IDS = [
  "school",
  "book",
  "graduate",
  "science",
  "code",
  "art",
  "music",
  "trophy",
  "world",
] as const;

export const academyTrackNameSchema = z.string().trim().min(1).max(60);

const academyTrackSchema = z.object({
  id: z.string().min(1).max(80),
  levelId: globalLevelIdSchema,
  name: academyTrackNameSchema,
});

export const createAcademySetupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: academySlugSchema,
  icon: z.enum(ACADEMY_ICON_IDS),
  subject: z.string().trim().min(1).max(60),
  levelIds: z.array(globalLevelIdSchema).min(1).max(GLOBAL_LEVEL_IDS.length),
  tracks: z.array(academyTrackSchema).max(100),
}).superRefine((setup, context) => {
  const selectedLevels = new Set(setup.levelIds);
  if (selectedLevels.size !== setup.levelIds.length) {
    context.addIssue({ code: "custom", path: ["levelIds"], message: "Choose each level only once." });
  }

  const trackNames = new Set<string>();
  setup.tracks.forEach((track, index) => {
    if (!selectedLevels.has(track.levelId)) {
      context.addIssue({ code: "custom", path: ["tracks", index, "levelId"], message: "Tracks must belong to a selected level." });
    }

    const key = `${track.levelId}:${track.name.trim().toLowerCase()}`;
    if (trackNames.has(key)) {
      context.addIssue({ code: "custom", path: ["tracks", index, "name"], message: "Track names must be unique within each level." });
    }
    trackNames.add(key);
  });
});

export type CreateAcademySetupInput = z.infer<typeof createAcademySetupSchema>;
