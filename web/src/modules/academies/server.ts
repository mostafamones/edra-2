import "server-only";

import type { Authority } from "../../lib/supabase/authority";
import { createClient } from "../../lib/supabase/server";
import { validAcademySlug } from "../../lib/routing";
import type { AcademyEntry } from "./queries";

/**
 * Session-bound membership read. RLS remains active; no service-role client. Pass a verified
 * `authority` for token-authenticated API requests; it defaults to the cookie session.
 */
export async function listStaffAcademies(authority?: Authority | null): Promise<AcademyEntry[]> {
  let client: Authority["db"];
  let userId: string;
  if (authority) {
    client = authority.db;
    userId = authority.userId;
  } else {
    const cookieClient = await createClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();
    if (authError || !user) return [];
    client = cookieClient as unknown as Authority["db"];
    userId = user.id;
  }
  const { data, error } = await client.from("academy_memberships")
    .select("academy_id, role, academies!inner(name, slug, icon)")
    .eq("user_id", userId).order("academy_id");
  if (error) throw error;
  return (data ?? []).flatMap(row => {
    if (!["owner", "admin", "instructor"].includes(row.role)) return [];
    return [{ id: row.academy_id, role: row.role as AcademyEntry["role"], ...row.academies }];
  });
}

/** Unknown and inaccessible slugs both return null, without an alternative academy. */
export async function resolveStaffAcademy(slug: string): Promise<AcademyEntry | null> {
  if (!validAcademySlug(slug)) return null;
  return (await listStaffAcademies()).find(academy => academy.slug === slug) ?? null;
}

/** Only the signed-in account's own previous removal is disclosed. */
export async function wasRemovedFromAcademy(slug: string) {
  if (!validAcademySlug(slug)) return false;
  const client = await createClient();
  const { data, error } = await client.rpc("was_removed_from_academy", { p_slug: slug });
  return !error && data === true;
}
