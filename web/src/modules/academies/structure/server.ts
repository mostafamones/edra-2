import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveStaffAcademy } from "../server";
import { isAcademyManager } from "../roles";
import type { StructureDb } from "./database";
import {
  offeringChangeSchema, offeringOutcomeSchema, offeringPreviewSchema, offeringRequestSchema, structureSchema,
  type StructureResult,
} from "./validation";

const messages = {
  validation: "Check the fields and try again.",
  forbidden: "You no longer have permission to make this change.",
  unavailable: "Couldn’t complete this change. Retry with the same request.",
  duplicate: "This offering or track name already exists.",
  retry_conflict: "This request was already used for a different change. Review the latest structure.",
};

/** All database calls use the ordinary caller's cookie session; no service-role fallback. */
export async function structureResult<T>(run: () => Promise<T>): Promise<StructureResult<T>> {
  try { return { ok: true, value: await run() }; }
  catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const code = error instanceof z.ZodError ? "validation" : detail === "forbidden" ? "forbidden"
      : detail === "idempotency_conflict" ? "retry_conflict"
        : /duplicate|unique constraint|already exists/.test(detail) ? "duplicate" : "unavailable";
    return { ok: false, code, message: messages[code] };
  }
}

export async function getStructure(slug: string) {
  const academy = await resolveStaffAcademy(slug);
  if (!academy) return null;
  const db = await createClient() as unknown as StructureDb;
  const { data, error } = await db.rpc("get_academy_structure", { p_academy_id: academy.id });
  if (error) throw new Error(error.message);
  return structureSchema.parse(data);
}

export async function previewOfferingChange(slug: string, input: unknown) {
  const change = offeringChangeSchema.parse(input);
  const academy = await resolveStaffAcademy(slug);
  if (!academy || !isAcademyManager(academy.role)) throw new Error("forbidden");
  const db = await createClient() as unknown as StructureDb;
  const { data, error } = await db.rpc("preview_offering_change", { p_academy_id: academy.id, p_change: change });
  if (error) throw new Error(error.message);
  return offeringPreviewSchema.parse(data);
}

export async function maintainOffering(slug: string, input: unknown) {
  const request = offeringRequestSchema.parse(input);
  const academy = await resolveStaffAcademy(slug);
  if (!academy || !isAcademyManager(academy.role)) throw new Error("forbidden");
  const db = await createClient() as unknown as StructureDb;
  const { data, error } = await db.rpc("maintain_academy_offering", {
    p_academy_id: academy.id, p_change: request.change, p_expected_revision: request.revision,
    p_fingerprint: request.fingerprint, p_request_key: request.requestKey,
  });
  if (error) throw new Error(error.message);
  return offeringOutcomeSchema.parse(data);
}
