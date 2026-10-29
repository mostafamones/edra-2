import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { toLabels } from "./validation";

/** Staff read in the browser; RLS returns the catalog only to the academy's active staff. */
export const labelsQueryKey = (academyId: string) => ["labels", academyId] as const;

export async function loadLabels(academyId: string) {
  const { data, error } = await createClient().from("labels").select("id, name, color").eq("academy_id", academyId);
  if (error) throw new Error(error.message);
  return toLabels(data);
}

export const useLabels = (academyId: string) => useQuery({ queryKey: labelsQueryKey(academyId), queryFn: () => loadLabels(academyId) });
