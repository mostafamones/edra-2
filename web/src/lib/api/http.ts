/**
 * Response conventions for the versioned external API (`/api/v1`): JSON bodies, stable upper-case
 * error codes with a request id, `Cache-Control: no-store`, and CORS only for configured browser
 * origins. Native clients do not need CORS.
 */

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "AMBIGUOUS_AUTHENTICATION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  | "ATTENDANCE_CONFLICT"
  | "REVIEW_REQUIRED"
  | "PUBLICATION_STALE"
  | "SESSION_ENDED"
  | "YEAR_CLOSED"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_ON_ROSTER"
  | "THROTTLED"
  | "INTERNAL";

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  AMBIGUOUS_AUTHENTICATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  ATTENDANCE_CONFLICT: 409,
  REVIEW_REQUIRED: 409,
  PUBLICATION_STALE: 409,
  SESSION_ENDED: 409,
  YEAR_CLOSED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  NOT_ON_ROSTER: 422,
  THROTTLED: 429,
  INTERNAL: 500,
};

const MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: "The request is not valid.",
  UNAUTHENTICATED: "Sign in again: the access token is missing, invalid, or expired.",
  AMBIGUOUS_AUTHENTICATION: "Send either a bearer token or a browser session, not both.",
  FORBIDDEN: "You are not a staff member of this academy.",
  NOT_FOUND: "Not found.",
  STUDENT_NOT_FOUND: "No student with this identifier exists for this session's academy and year.",
  ATTENDANCE_CONFLICT: "Someone else changed this attendance first. Review the current values and try again.",
  REVIEW_REQUIRED: "This student is marked absent or excused. A staff member must review the change.",
  PUBLICATION_STALE: "Attendance changed after you reviewed it. Refresh and review again before publishing.",
  SESSION_ENDED: "This session has ended. Check-ins are only accepted while it is live.",
  YEAR_CLOSED: "This academic year is closed. Attendance is read-only.",
  IDEMPOTENCY_CONFLICT: "This Idempotency-Key was already used for a different request.",
  NOT_ON_ROSTER: "This student is not on the session's roster. A staff member must review it.",
  THROTTLED: "Too many requests. Retry after the indicated delay.",
  INTERNAL: "Something went wrong. Retry with the same Idempotency-Key.",
};

export const API_ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key";
const EXPOSED_HEADERS = "X-Request-Id, Retry-After";

/** Browser origins allowed to call the API, from the server-only EDRA_API_ALLOWED_ORIGINS list. */
export function allowedOrigins(): string[] {
  return (process.env.EDRA_API_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

export function corsHeaders(origin: string | null, methods: string): Record<string, string> {
  if (!origin || !allowedOrigins().includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": API_ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** Unauthenticated preflight. It grants nothing by itself: every real request still needs a token. */
export function preflight(request: Request, methods: string) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request.headers.get("origin"), methods), "Cache-Control": "no-store" } });
}

export type ApiContext = { requestId: string; origin: string | null; methods: string };

function headers(context: ApiContext, extra?: Record<string, string>) {
  return { ...corsHeaders(context.origin, context.methods), "Cache-Control": "no-store", "X-Request-Id": context.requestId, ...extra };
}

export function apiJson(context: ApiContext, body: unknown, status = 200) {
  return Response.json(body, { status, headers: headers(context) });
}

export function apiError(
  context: ApiContext, code: ApiErrorCode, extra?: { details?: unknown; retryAfter?: number; message?: string },
) {
  const body = {
    error: { code, message: extra?.message ?? MESSAGES[code], request_id: context.requestId, ...(extra?.details === undefined ? {} : { details: extra.details }) },
  };
  return Response.json(body, {
    status: STATUS[code],
    headers: headers(context, extra?.retryAfter ? { "Retry-After": String(extra.retryAfter) } : undefined),
  });
}

/** Converts camelCase object keys to snake_case, recursively, for the external JSON contract. */
export function snakeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), snakeKeys(item)]));
  }
  return value;
}

/** Parses a JSON request body, or null when it is missing, too large, or malformed. */
export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<unknown | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
