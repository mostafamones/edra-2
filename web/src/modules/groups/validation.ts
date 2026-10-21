import { z } from "zod";

export const groupInputSchema = z.object({
  academyId: z.guid(),
  name: z.string().trim().min(2).max(100),
  levelId: z.string().min(1),
  trackId: z.guid().nullable(),
  capacity: z.number().int().positive().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export type GroupInput = z.infer<typeof groupInputSchema>;

