import type { CookieOptionsWithName } from "@supabase/ssr";
import { platformOrigins } from "../routing";

/** New namespace avoids ambiguous old host-only cookies during the host migration. */
export const AUTH_COOKIE_NAME = "edra-auth-v1";

export function authCookieOptions(): CookieOptionsWithName {
  const configured = process.env.NEXT_PUBLIC_EDRA_COOKIE_DOMAIN;
  const domain = configured?.replace(/^\./, "") || (process.env.NODE_ENV !== "production" ? "lvh.me" : undefined);
  if (!domain || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain) || domain.endsWith(".vercel.app") || domain === "vercel.app") {
    throw new Error("Configure an owned parent domain for shared authentication cookies.");
  }
  const origins = platformOrigins();
  for (const platform of ["staff", "student"] as const) {
    const hostname = new URL(origins[platform]).hostname;
    if (hostname !== domain && !hostname.endsWith(`.${domain}`)) {
      // localhost is only a legacy development entry, never a shared cookie host.
      if (process.env.NODE_ENV !== "production" && hostname === "localhost") continue;
      throw new Error("Authentication cookie domain must contain both configured platform hosts.");
    }
  }
  return { name: AUTH_COOKIE_NAME, domain, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" };
}

export function isLegacyAuthCookie(name: string) {
  const reference = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  return name === `sb-${reference}-auth-token` || name.startsWith(`sb-${reference}-auth-token.`) || name === `sb-${reference}-auth-token-code-verifier`;
}
