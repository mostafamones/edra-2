import { createClient } from "@/lib/supabase/client";

/** Private profile images, shared by team and concern presentation. Memory only; expires in one hour. */
export async function resolveProfileAvatars(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data, error } = await createClient().storage.from("avatars").createSignedUrls([...new Set(paths)], 60 * 60);
  if (error) throw error;
  return Object.fromEntries(data?.flatMap((entry) => entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : []) ?? []);
}
