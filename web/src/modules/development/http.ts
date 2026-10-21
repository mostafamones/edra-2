import "server-only";

import { z } from "zod";

import { platformOrigin } from "@/lib/routing";

import { developmentConfig } from "./config";
import { enterPreview, exitPreview, previewStatus, returnToStaff, switchPreview } from "./service";
import type { PreviewErrorCode, PreviewResult } from "./types";

const headers = { "Cache-Control": "private, no-store" };
const logicalId = z.string().regex(/^account:(staff|student):[a-z0-9-]+$/);
const revision = z.number().int().min(0).max(1_000_000);
const returnTo = z.string().max(1200).nullable();
const bodies = {
  enter: z.object({ runId: z.uuid(), studentLogicalId: logicalId.nullable(), returnTo }).strict(),
  switch: z.object({ runId: z.uuid(), logicalId, expectedRevision: revision, commandId: z.uuid(), returnTo }).strict(),
  return: z.object({ runId: z.uuid(), expectedRevision: revision, commandId: z.uuid() }).strict(),
  exit: z.object({ runId: z.uuid().nullable() }).strict(),
};
export type PreviewAction = keyof typeof bodies;

const STATUS: Record<PreviewErrorCode, number> = {
  unavailable: 404, invalid_request: 400, forbidden: 403, not_allowed: 403, run_unavailable: 409, session_inactive: 401,
  nested: 409, inactive: 410, conflict: 409, stale: 409, busy: 409, session_mismatch: 409, invalid_target: 400,
  sign_in_failed: 502, original_unavailable: 401,
};

const reply = (result: PreviewResult | { ok: false; error: PreviewErrorCode }) =>
  Response.json(result, { status: result.ok ? 200 : STATUS[result.error], headers });

export async function previewStatusGet() {
  return Response.json(await previewStatus(), { headers });
}

/** Same-origin JSON POST from a canonical staff or student origin, bounded to 4 KiB. */
async function readBody(request: Request): Promise<unknown | null> {
  const origin = request.headers.get("origin");
  if ((origin !== platformOrigin("staff") && origin !== platformOrigin("student"))
    || request.headers.get("sec-fetch-site") === "cross-site" || request.headers.has("authorization")) return null;
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function previewPost(request: Request, action: PreviewAction) {
  if (!developmentConfig()) return reply({ ok: false, error: "unavailable" });
  const raw = await readBody(request);
  if (raw === null) return reply({ ok: false, error: "forbidden" });
  try {
    switch (action) {
      case "enter": {
        const body = bodies.enter.safeParse(raw);
        return reply(body.success ? await enterPreview(body.data) : { ok: false, error: "invalid_request" });
      }
      case "switch": {
        const body = bodies.switch.safeParse(raw);
        return reply(body.success ? await switchPreview(body.data) : { ok: false, error: "invalid_request" });
      }
      case "return": {
        const body = bodies.return.safeParse(raw);
        return reply(body.success ? await returnToStaff(body.data) : { ok: false, error: "invalid_request" });
      }
      case "exit": {
        const body = bodies.exit.safeParse(raw);
        return reply(body.success ? await exitPreview() : { ok: false, error: "invalid_request" });
      }
    }
  } catch {
    // Registry or provider failures are functional errors; nothing sensitive is echoed.
    console.error("Developer mode request failed", { action });
    return reply({ ok: false, error: "unavailable" });
  }
}
