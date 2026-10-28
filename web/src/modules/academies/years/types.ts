import { z } from "zod";

export const yearLearningSchema = z.object({
  year: z.object({ id: z.guid(), startYear: z.number().int(), startedAt: z.string().nullable() }).nullable(),
  canManage: z.boolean(),
});

export type YearLearning = z.infer<typeof yearLearningSchema>;
