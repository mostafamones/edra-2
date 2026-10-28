/** Failure simulator contract shared by the server injector, the browser injector and the controls. */
export const FAILURE_COOKIE = "edra-dev-failure";
export const FAILURE_CHANGE_EVENT = "edra-dev-failure-change";

export const FAILURE_KINDS = {
  network: "Network error",
  unavailable: "Service unavailable",
  timeout: "Timeout",
  permission: "Permission denied",
  conflict: "Conflict",
} as const;
export type FailureKind = keyof typeof FAILURE_KINDS;
export type FailureMode = "once" | "persistent";

/** One armed failure. `operation` is `<METHOD> <resource>`, for example `GET students` or `POST rpc/create_session`. */
export type Arm = { id: string; operation: string; kind: FailureKind; mode: FailureMode };

export type FailureStatus = { armed: Arm | null; triggered: number; operations: string[] };

const STORAGE_VERBS = new Set(["sign", "public", "authenticated", "upload", "info", "list", "move", "copy"]);
const OPERATION = /^(GET|POST|PATCH|PUT|DELETE) (?:rpc\/|storage\/|functions\/)?[A-Za-z0-9_-]+$/;

export const isOperation = (value: string) => OPERATION.test(value);
export const isWrite = (operation: string) => !operation.startsWith("GET ");

/**
 * The simulated operation of a Supabase request, or null for requests the simulator never touches.
 * Auth is excluded so a simulation can never sign out or revoke a real session.
 */
export function operationOf(url: string, method = "GET"): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  const [, service, version, ...rest] = path.split("/");
  if (version !== "v1" || rest.length === 0) return null;
  let resource: string | undefined;
  if (service === "rest") resource = rest[0] === "rpc" ? rest[1] && `rpc/${rest[1]}` : rest[0];
  else if (service === "storage" && rest[0] === "object") {
    const bucket = rest.slice(1).find((segment) => !STORAGE_VERBS.has(segment));
    resource = bucket && `storage/${bucket}`;
  } else if (service === "functions") resource = `functions/${rest[0]}`;
  const operation = resource ? `${verb} ${resource}` : null;
  return operation && isOperation(operation) ? operation : null;
}

/** A response with the shape the real service returns for this failure. Network failures throw like fetch. */
export function failureResponse(kind: FailureKind): Response {
  const body = (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ code, message, details: null, hint: "Simulated by Developer mode" }), {
      status, headers: { "Content-Type": "application/json" },
    });
  switch (kind) {
    case "network": throw new TypeError("fetch failed");
    case "unavailable": return body(503, "PGRST001", "Service unavailable");
    case "timeout": return body(500, "57014", "canceling statement due to statement timeout");
    case "permission": return body(403, "42501", "permission denied");
    case "conflict": return body(409, "23505", "duplicate key value violates unique constraint");
  }
}

/** Arm payload of a cookie value `<payload>.<signature>`; signatures are verified on the server only. */
export function readArm(value: string | undefined | null): Arm | null {
  const payload = value?.split(".")[0];
  if (!payload) return null;
  try {
    const arm = JSON.parse(base64UrlDecode(payload)) as Partial<Arm>;
    if (typeof arm.id !== "string" || typeof arm.operation !== "string" || !isOperation(arm.operation)) return null;
    if (!arm.kind || !(arm.kind in FAILURE_KINDS) || (arm.mode !== "once" && arm.mode !== "persistent")) return null;
    return { id: arm.id, operation: arm.operation, kind: arm.kind, mode: arm.mode };
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
}
