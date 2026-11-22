import "@tanstack/react-start/server-only";
import { academyMember } from "@/lib/supabase/membership";
import type { Json } from "@/lib/supabase/database.types";
import { isAcademyManager } from "@/modules/academies/roles";
import {
  bankDetailSchema, bankPageSchema, catalogSchema, collectionsSchema, maxSaveBytes, pageSize, saveBankInput,
  type BankCollections, type BankDetail, type BankFilters, type BankPage, type BankProgram, type BankResult,
} from "./bank-contract";

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

export async function loadCollections(academyId: string): Promise<BankResult<BankCollections>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("get_question_bank_collections", { p_academy_id: academyId });
  const parsed = collectionsSchema.safeParse(data);
  return error || !parsed.success ? { ok: false, message: "Couldn’t load collections. Try again." } : { ok: true, data: parsed.data };
}

export async function listBank(academyId: string, filters: BankFilters): Promise<BankResult<BankPage>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("list_question_bank_questions", {
    p_academy_id: academyId, p_collection_id: filters.collectionId as string, p_query: filters.query.trim(), p_offset: filters.offset, p_limit: pageSize,
  });
  const parsed = bankPageSchema.safeParse(data);
  return error || !parsed.success ? loadFailed : { ok: true, data: parsed.data };
}

export async function readBank(academyId: string, id: string): Promise<BankResult<BankDetail>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("get_question_bank_question", { p_academy_id: academyId, p_id: id });
  if (!error && data === null) return { ok: false, message: "This question is no longer in the bank." };
  const parsed = bankDetailSchema.safeParse(data);
  return error || !parsed.success ? loadFailed : { ok: true, data: parsed.data };
}

const collectionError = (message: string) => message === "duplicate_name" ? "A collection with this name already exists."
  : message === "invalid_collection" ? "This collection is no longer available. Reload and try again."
  : message === "invalid_questions" ? "One or more questions are no longer available. Reload and try again."
  : "Couldn’t update the collection. Try again.";

export async function createCollection(academyId: string, id: string, kind: "topic" | "custom", name: string): Promise<BankResult<string>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("create_question_bank_collection", { p_academy_id: academyId, p_id: id, p_kind: kind, p_name: name });
  return error ? { ok: false, message: collectionError(error.message) } : { ok: true, data };
}

export async function renameCollection(academyId: string, id: string, name: string): Promise<BankResult<null>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { error } = await db.rpc("rename_question_bank_collection", { p_academy_id: academyId, p_id: id, p_name: name });
  return error ? { ok: false, message: collectionError(error.message) } : { ok: true, data: null };
}

export async function setMembership(academyId: string, collectionId: string, questionIds: string[], member: boolean): Promise<BankResult<number>> {
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("set_question_bank_memberships", {
    p_academy_id: academyId, p_collection_id: collectionId, p_question_ids: questionIds, p_member: member,
  });
  return error ? { ok: false, message: collectionError(error.message) } : { ok: true, data };
}

export async function saveBank(value: unknown): Promise<BankResult<number>> {
  const parsed = saveBankInput.safeParse(value);
  if (!parsed.success) return { ok: false, message: "One or more questions could not be saved. Check the selection and attachments." };
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > maxSaveBytes) {
    return { ok: false, message: "This selection is too large. Save fewer questions at a time." };
  }
  const { academyId, programId, questions, document, collectionId } = parsed.data;
  const db = await manager(academyId);
  if (!db) return denied;
  const { data, error } = await db.rpc("save_question_bank_import", {
    p_academy_id: academyId, p_questions: questions as Json, p_document: document as Json,
    ...(programId ? { p_program_id: programId } : {}), ...(collectionId ? { p_collection_id: collectionId } : {}),
  });
  if (error) return { ok: false, message: ["invalid_program", "invalid_unit"].includes(error.message)
    ? "A selected unit or program is no longer available. Reload Library units and try again."
    : ["invalid_document", "invalid_collection"].includes(error.message)
      ? "The selected source document or collection is no longer available. Choose it again."
      : "Couldn’t save these questions. Your review is still here." };
  return { ok: true, data };
}
