import "server-only";

import { AUTH_COOKIE_NAME, isLegacyAuthCookie } from "@/lib/supabase/cookie-policy";
import { bearerAuthority, type Authority } from "@/lib/supabase/authority";
import { apiError, type ApiContext } from "./http";

/** Raised by the database pre-request check (edra_auth.check_request). */
const SESSION_INACTIVE = "EDRA_SESSION_INACTIVE";

/** Per-user fixed windows shared by every server instance. The database owns the actual limits. */
const LIMITS = { read: { limit: 300, windowSeconds: 60 }, write: { limit: 120, windowSeconds: 60 } } as const;

export type StaffApiContext = ApiContext & { authority: Authority };

/** The bearer token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer[ ]+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/.exec(header?.trim() ?? "");
  return match ? match[1] : null;
}

/** True when the request also carries a browser auth session cookie. */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  return (cookieHeader ?? "").split(";").some((part) => {
    const name = part.split("=")[0]?.trim() ?? "";
    if (!name) return false;
    return name === AUTH_COOKIE_NAME || name.startsWith(`${AUTH_COOKIE_NAME}.`) || isLegacyAuthCookie(name);
  });
}

/**
 * Runs an external API handler for a signed-in staff member. Authentication is bearer-only: the
 * token is verified, mixed cookie + bearer requests are rejected, and every request is throttled
 * per user. Academy membership is checked by the domain operation the handler calls.
 */
export async function withStaffApi(
  request: Request, methods: string, kind: keyof typeof LIMITS, handler: (context: StaffApiContext) => Promise<Response>,
): Promise<Response> {
  const context: ApiContext = { requestId: crypto.randomUUID(), origin: request.headers.get("origin"), methods };
  try {
    const header = request.headers.get("authorization");
    const token = bearerToken(header);
    if (!token) return apiError(context, "UNAUTHENTICATED");
    if (hasSessionCookie(request.headers.get("cookie"))) return apiError(context, "AMBIGUOUS_AUTHENTICATION");
    const authority = await bearerAuthority(token);
    if (!authority) return apiError(context, "UNAUTHENTICATED");

    const { limit, windowSeconds } = LIMITS[kind];
    const { data, error } = await authority.db.rpc("consume_api_quota", { p_bucket: `api:${kind}`, p_limit: limit, p_window_seconds: windowSeconds });
    // The database refuses revoked and recovery-only sessions before any statement runs.
    if (error?.code === SESSION_INACTIVE) return apiError(context, "UNAUTHENTICATED");
    const quota = data as { allowed?: boolean; retry_after?: number } | null;
    // A throttle outage must not block attendance; the domain operation still authorizes.
    if (quota && quota.allowed === false) return apiError(context, "THROTTLED", { retryAfter: quota.retry_after ?? 60 });

    return await handler({ ...context, authority });
  } catch {
    return apiError(context, "INTERNAL");
  }
}
