import "@tanstack/react-start/server-only";
import { academyMember } from "@/lib/supabase/membership";
import type { Json } from "@/lib/supabase/database.types";
import { isAcademyManager } from "@/modules/academies/roles";
import { bankPayload, catalogSchema, maxSaveBytes, saveBankInput, type BankPayload, type BankProgram, type BankResult, type BankSummary } from "./bank-contract";

async function manager(academyId: string) {
  const actor = await academyMember(academyId);
  return actor && isAcademyManager(actor.role) ? actor.db : null;
}
const denied = { ok: false, message: "You don’t have permission to manage this question bank." } as const;
const loadFailed = { ok: false, message: "Couldn’t load the question bank. Try again." } as const;

export async function loadBankCatalog(academyId: string): Promise<BankResult<BankProgram[]>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("get_question_bank_units", { p_academy_id: academyId });
  const parsed = catalogSchema.safeParse(data);
  return error || !parsed.success ? { ok: false, message: "Couldn’t load Library units. Try again." } : { ok: true, data: parsed.data };
}

export async function listBank(academyId: string, offset: number): Promise<BankResult<{ rows: BankSummary[]; more: boolean }>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.from("question_bank_questions")
    .select("id,unit_id,prompt:payload->>prompt,topic:payload->>topic")
    .eq("academy_id", academyId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 24);
  return error ? loadFailed : { ok: true, data: {
    rows: data.slice(0, 24).map(q => ({ id: q.id, unitId: q.unit_id, prompt: q.prompt ?? "", topic: q.topic })),
    more: data.length > 24,
  } };
}

export async function readBank(academyId: string, id: string): Promise<BankResult<BankPayload>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.from("question_bank_questions").select("payload").eq("academy_id", academyId).eq("id", id).maybeSingle();
  const parsed = bankPayload.safeParse(data?.payload);
  return error || !parsed.success ? loadFailed : { ok: true, data: parsed.data };
}

export async function saveBank(value: unknown): Promise<BankResult<number>> {
  const parsed = saveBankInput.safeParse(value);
  if (!parsed.success) return { ok: false, message: "One or more questions could not be saved. Check the selection and attachments." };
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > maxSaveBytes) {
    return { ok: false, message: "This selection is too large. Save fewer questions at a time." };
  }
  const { academyId, programId, questions } = parsed.data;
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("save_question_bank_questions", {
    p_academy_id: academyId, p_questions: questions as Json, ...(programId ? { p_program_id: programId } : {}),
  });
  if (error) return { ok: false, message: ["invalid_program", "invalid_unit"].includes(error.message)
    ? "A selected unit or program is no longer available. Reload Library units and try again."
    : "Couldn’t save these questions. Your review is still here." };
  return { ok: true, data };
}
