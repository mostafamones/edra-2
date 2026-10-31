import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { LabelDomain } from "./types";
import { toLabels } from "./validation";

/** Staff read in the browser; RLS returns the catalog only to the academy's active staff. */
export const labelsQueryKey = (academyId: string, domain: LabelDomain) => ["labels", academyId, domain] as const;

export async function loadLabels(academyId: string, domain: LabelDomain) {
  const { data, error } = await createClient().from("labels").select("id, name, color").match({ academy_id: academyId, domain });
  if (error) throw new Error(error.message);
  return toLabels(data);
}

export const useLabels = (academyId: string, domain: LabelDomain) => useQuery({ queryKey: labelsQueryKey(academyId, domain), queryFn: () => loadLabels(academyId, domain) });
