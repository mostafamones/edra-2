import "server-only";

import { createClient as createTokenClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { createClient } from "./server";
import { isPhoneCodeSession } from "./session-grade";

export type Db = SupabaseClient<Database>;

/**
 * A verified signed-in caller and the database client that acts as them, so RLS stays active.
 * Web requests use the cookie session; external API requests use a staff access token. Phone-code
 * (recovery) sessions are refused here; the database also refuses them and any revoked session.
 */
export type Authority = { db: Db; userId: string };

/** The signed-in user from the request's auth cookies, or null. */
export async function cookieAuthority(): Promise<Authority | null> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || isPhoneCodeSession(data.claims)) return null;
  return { db: db as unknown as Db, userId };
}

/**
 * The user a Supabase access token belongs to, or null when it is invalid or expired. The token is
 * verified (signature and expiry) and then sent with every query so RLS sees that user. Never
 * accepts the project publishable key as authentication.
 */
export async function bearerAuthority(token: string): Promise<Authority | null> {
  const db = createTokenClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    const { data, error } = await db.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub || claims.role !== "authenticated" || isPhoneCodeSession(claims)) return null;
    return { db, userId: claims.sub };
  } catch {
    return null;
  }
}
