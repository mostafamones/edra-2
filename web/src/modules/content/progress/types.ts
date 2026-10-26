import { z } from "zod";
const unitInput = z.object({ academyId: z.guid(), unitId: z.guid() });

export const progressItemSchema = z.object({
  itemId: z.guid(), completed: z.boolean(),
  watchedSeconds: z.number().nonnegative().optional(), durationSeconds: z.number().positive().nullable().optional(),
  positionSeconds: z.number().nonnegative().optional(),
});
export const unitProgressSchema = z.object({ items: z.array(progressItemSchema), completed: z.number().int().nonnegative(), total: z.number().int().nonnegative() });
export type UnitProgress = z.infer<typeof unitProgressSchema>;
export const startProgressInput = unitInput.extend({ itemId: z.guid() });
export const progressSessionSchema = z.object({ sessionId: z.guid(), durationSeconds: z.number().positive(), positionSeconds: z.number().nonnegative() });
export type ProgressSession = z.infer<typeof progressSessionSchema>;
export const checkpointSchema = unitInput.extend({ sessionId: z.guid(), sequence: z.number().int().positive().max(2147483647),
  position: z.number().finite().min(0).max(43200), ranges: z.array(z.tuple([z.number().finite().min(0), z.number().finite().max(43200)])).max(100),
});
export const savedProgressSchema = z.object({ positionSeconds: z.number().nonnegative(), watchedSeconds: z.number().nonnegative(), durationSeconds: z.number().positive(), completed: z.boolean() });
