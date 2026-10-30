"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth";
import { parseTimeFormat } from "./time-format";

export const timeFormatKey = (userId: string) => ["account", "time-format", userId] as const;
export function useTimeFormat() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: timeFormatKey(user?.id ?? "none"), enabled: !!user,
    queryFn: async ({ signal }) => {
      const { data, error } = await createClient().from("profiles").select("time_format").eq("id", user!.id).abortSignal(signal).single();
      if (error) throw new Error(error.message);
      return parseTimeFormat(data.time_format);
    },
  });
  return { ...query, format: query.data ?? "24h", userId: user?.id };
}
