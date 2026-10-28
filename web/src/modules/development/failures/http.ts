import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { platformOrigin } from "@/lib/routing";
import { authCookieOptions } from "@/lib/supabase/cookie-policy";

import { CONTROL_COOKIE, developmentConfig } from "../config";
import { previewLive } from "../service";
import { failureState, signature, trigger, verifiedArm } from "./inject";
import { FAILURE_COOKIE, FAILURE_KINDS, isOperation, isWrite, type Arm, type FailureStatus } from "./shared";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export function clearedFailureCookie() {
  return { name: FAILURE_COOKIE, value: "", domain: authCookieOptions().domain, path: "/", maxAge: 0 };
}

export async function failuresGet(request: Request) {
  if (!developmentConfig() || !(await previewLive())) return json({ error: "unavailable" }, 404);
  const store = await cookies();
  const armed = verifiedArm(store);
  const page = new URL(request.url).searchParams.get("page");
  const pages = page ? [failureState.observed.get(page)] : [...failureState.observed.values()];
  const operations = [...new Set(pages.flatMap((set) => [...(set ?? [])]))].sort();
  return json({ armed, triggered: armed ? failureState.triggered.get(armed.id) ?? 0 : 0, operations } satisfies FailureStatus);
}

const bodies = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("arm"),
    operation: z.string().max(120).refine(isOperation),
    kind: z.enum(Object.keys(FAILURE_KINDS) as [keyof typeof FAILURE_KINDS]),
    mode: z.enum(["once", "persistent"]),
  }).strict().refine((arm) => arm.kind !== "conflict" || isWrite(arm.operation)),
  z.object({ action: z.literal("trigger"), id: z.guid() }).strict(),
  z.object({ action: z.literal("clear") }).strict(),
]);

/** Same-origin JSON POST from a canonical staff or student origin while the preview is live. */
export async function failuresPost(request: Request) {
  const origin = request.headers.get("origin");
  if (!developmentConfig() || (origin !== platformOrigin("staff") && origin !== platformOrigin("student"))
    || request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "forbidden" }, 403);
  const body = bodies.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_request" }, 400);
  const store = await cookies();
  if (body.data.action === "clear") {
    store.set(clearedFailureCookie());
    return json({ ok: true });
  }
  if (!(await previewLive())) return json({ error: "unavailable" }, 404);
  if (body.data.action === "trigger") {
    // Browser requests consume through the same counter, so a once-only arm fails one request in total.
    const arm = verifiedArm(store);
    return json({ fail: arm?.id === body.data.id && trigger(arm) });
  }
  const control = store.get(CONTROL_COOKIE)!.value;
  const { operation, kind, mode } = body.data;
  const arm: Arm = { id: randomUUID(), operation, kind, mode };
  const payload = Buffer.from(JSON.stringify(arm)).toString("base64url");
  // Readable by the page so a tab can hold it while hidden and clear it even when the app is failing.
  store.set({
    name: FAILURE_COOKIE, value: `${payload}.${signature(developmentConfig()!.key, payload, control)}`,
    domain: authCookieOptions().domain, path: "/", sameSite: "lax", maxAge: 2 * 60 * 60,
    secure: platformOrigin("staff").startsWith("https:"),
  });
  return json({ ok: true, arm });
}
