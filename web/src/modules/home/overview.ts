import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

export const overviewSchema = z.object({
  year: z.number().nullable(), asOf: z.string(), attentionCount: z.number().int().nonnegative(),
  students: z.object({ total: z.number(), online: z.number(), levels: z.array(z.object({ id: z.string(), name: z.string(), total: z.number(), online: z.number() })) }),
  attention: z.array(z.object({ kind: z.enum(["attendance", "review", "assignment"]), id: z.string(), title: z.string(), amount: z.number() })),
  today: z.array(z.object({ id: z.string(), title: z.string(), location: z.string().nullable(), startsAt: z.string(), endsAt: z.string() })),
  // Optional until the dashboard migration reaches every database; absent means unknown, never zero.
  attendance: z.array(z.object({ week: z.string(), sessions: z.number(), attended: z.number(), counted: z.number(),
    present: z.number(), late: z.number(), absent: z.number(), excused: z.number(), added: z.number() })).optional(),
  watch: z.array(z.object({ id: z.string(), name: z.string(), level: z.string(), absent: z.number(), counted: z.number() })).optional(),
  assignments: z.array(z.object({ id: z.string(), title: z.string(), at: z.string(), recipients: z.number(), marked: z.number(), average: z.number(), below: z.number() })).optional(),
  recent: z.array(z.object({ id: z.string(), title: z.string(), startedAt: z.string(), finalized: z.boolean(), attended: z.number(), counted: z.number() })).optional(),
});
export type Overview = z.infer<typeof overviewSchema>;
export type Week = NonNullable<Overview["attendance"]>[number];

/** Present and late over present, late and absent; null when nothing was counted. */
export const rate = (weeks: Pick<Week, "attended" | "counted">[]) => {
  const counted = weeks.reduce((sum, week) => sum + week.counted, 0);
  return counted ? Math.round(weeks.reduce((sum, week) => sum + week.attended, 0) / counted * 100) : null;
};
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
