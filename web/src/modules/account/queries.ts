"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth";

import { accountName } from "./validation";

export type AccountProfile = { fullName: string | null; displayName: string | null; avatarPath: string | null };

export const accountQueryKeys = {
  all: ["account"] as const,
  profile: (userId: string) => ["account", "profile", userId] as const,
  avatar: (path: string) => ["account", "avatar", path] as const,
};

const SIGNED_URL_SECONDS = 60 * 60;

async function fetchAccountProfile(userId: string, signal: AbortSignal): Promise<AccountProfile> {
  const { data, error } = await createClient().from("profiles")
    .select("full_name, display_name, avatar_path").eq("id", userId).abortSignal(signal).single();
  if (error) throw new Error(error.message);
  return { fullName: data.full_name, displayName: data.display_name, avatarPath: data.avatar_path };
}

/**
 * The signed-in account's canonical profile. Refetched on focus so changes saved on the other
 * platform origin appear when the user returns.
 */
export function useAccountProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const profile = useQuery({
    queryKey: accountQueryKeys.profile(userId ?? "none"),
    queryFn: ({ signal }) => fetchAccountProfile(userId!, signal),
    enabled: Boolean(userId),
    staleTime: 0,
  });
  const avatarPath = profile.data?.avatarPath ?? null;
  // Owner-only private object; the signed URL is presentation, never stored.
  const avatar = useQuery({
    queryKey: accountQueryKeys.avatar(avatarPath ?? "none"),
    queryFn: async () => {
      const { data, error } = await createClient().storage.from("avatars").createSignedUrl(avatarPath!, SIGNED_URL_SECONDS);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    enabled: Boolean(avatarPath),
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
    refetchInterval: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
  });
  return {
    profile: profile.data ?? null,
    name: accountName(profile.data ? { full_name: profile.data.fullName, display_name: profile.data.displayName } : null),
    avatarUrl: avatarPath ? avatar.data : undefined,
    isLoading: profile.isLoading,
    error: profile.error,
    refetch: profile.refetch,
  };
}
