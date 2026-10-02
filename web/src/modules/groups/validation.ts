import { z } from "zod";

export const groupInputSchema = z.object({
  academyId: z.uuid(),
  name: z.string().trim().min(2).max(100),
  levelId: z.string().min(1),
  trackId: z.uuid().nullable(),
  capacity: z.number().int().positive().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export type GroupInput = z.infer<typeof groupInputSchema>;

