import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

export const overviewSchema = z.object({
  year: z.number().nullable(), asOf: z.string(), attentionCount: z.number().int().nonnegative(),
  students: z.object({ total: z.number(), online: z.number(), levels: z.array(z.object({ id: z.string(), name: z.string(), total: z.number(), online: z.number() })) }),
  attention: z.array(z.object({ kind: z.enum(["attendance", "review", "assignment"]), id: z.string(), title: z.string(), amount: z.number() })),
  today: z.array(z.object({ id: z.string(), title: z.string(), location: z.string().nullable(), startsAt: z.string(), endsAt: z.string() })),
});
export type Overview = z.infer<typeof overviewSchema>;
export const homeOverviewOptions = (academyId: string) => queryOptions({
  queryKey: ["home", academyId, "overview"] as const,
  staleTime: 30_000,
  refetchInterval: 60_000,
  queryFn: async ({ signal }) => {
    const { data, error } = await createClient().rpc("staff_home", { p_academy_id: academyId }).abortSignal(signal);
    if (error) throw new Error("Couldn’t refresh the academy overview. Try again.");
    return overviewSchema.parse(data);
  },
});
