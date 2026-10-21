import { z } from "zod";

import { globalLevelIdSchema } from "../levels";
import { academyTrackNameSchema } from "../validation";

const level = { levelId: globalLevelIdSchema };
export const offeringChangeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("add_level"), ...level }).strict(),
  z.object({ operation: z.literal("add_track"), ...level, name: academyTrackNameSchema }).strict(),
  z.object({ operation: z.literal("rename_track"), ...level, trackId: z.uuid(), name: academyTrackNameSchema }).strict(),
  z.object({ operation: z.literal("remove_track"), ...level, trackId: z.uuid() }).strict(),
  z.object({ operation: z.literal("remove_level"), ...level }).strict(),
  z.object({ operation: z.literal("stop_level"), ...level }).strict(),
  z.object({ operation: z.literal("resume_level"), ...level }).strict(),
]);
export type OfferingChange = z.infer<typeof offeringChangeSchema>;

const countsSchema = z.record(z.string(), z.number().int().nonnegative());
export const structureSchema = z.object({
  academyId: z.uuid(), accountId: z.uuid(), canManage: z.boolean(), revision: z.number().int().positive(),
  transitionsEnabled: z.boolean().default(false),
  levels: z.array(z.object({
    id: z.string(), name: z.string(), version: z.number().int().positive(),
    stoppedAt: z.string().nullable(), resumedAt: z.string().nullable(), dependencies: countsSchema,
    tracks: z.array(z.object({ id: z.uuid(), name: z.string(), retiredAt: z.string().nullable(), version: z.number().int().positive() })),
  })),
});
export type AcademyStructure = z.infer<typeof structureSchema>;
export const offeringPreviewSchema = z.object({
  change: offeringChangeSchema, revision: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  changes: countsSchema, blockers: countsSchema, dependencies: countsSchema, academicYearId: z.uuid().nullable(),
  preserved: countsSchema.default({}),
});
export type OfferingPreview = z.infer<typeof offeringPreviewSchema>;
export const offeringRequestSchema = z.object({
  change: offeringChangeSchema, revision: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/), requestKey: z.uuid(),
}).strict();
export type OfferingRequest = z.infer<typeof offeringRequestSchema>;
export const offeringOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("committed"), structure: structureSchema, replayed: z.boolean(), trackId: z.uuid().nullable() }),
  z.object({ outcome: z.literal("conflict"), preview: offeringPreviewSchema }),
  z.object({ outcome: z.literal("blocked"), preview: offeringPreviewSchema }),
]);
export type OfferingOutcome = z.infer<typeof offeringOutcomeSchema>;
export type StructureResult<T> = { ok: true; value: T } | { ok: false; code: "validation" | "forbidden" | "unavailable" | "duplicate" | "retry_conflict"; message: string };
