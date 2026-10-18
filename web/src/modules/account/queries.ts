"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth";

import { fetchContacts } from "./contact";
import { accountName } from "./validation";

export type AccountProfile = { fullName: string | null; displayName: string | null; avatarPath: string | null };

export const accountQueryKeys = {
  all: ["account"] as const,
  profile: (userId: string) => ["account", "profile", userId] as const,
  avatar: (path: string) => ["account", "avatar", path] as const,
  contacts: (userId: string, sessionId: string) => ["account", "contacts", userId, sessionId] as const,
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

/**
 * The caller's verified login and parent phones and this session's unfinished contact changes,
 * read through the account-contact function. Keyed by session so another session's operation is
 * never resumed here.
 */
export function useAccountContacts() {
  const { user, session } = useAuth();
  const userId = user?.id ?? null;
  const sessionKey = session?.access_token ? sessionIdOf(session.access_token) : "none";
  return useQuery({
    queryKey: accountQueryKeys.contacts(userId ?? "none", sessionKey),
    queryFn: async () => {
      const result = await fetchContacts();
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

function sessionIdOf(token: string) {
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.session_id === "string" ? claims.session_id : "none";
  } catch {
    return "none";
  }
}
