import "server-only";
import { z } from "zod";
import { cookieAuthority } from "@/lib/supabase/authority";
import { contentCaller } from "../data";
import { historySchema, learningError, learningListSchema, learningUnitSchema, unitInput, workspaceSchema } from "./types";

export async function learningCaller() {
  const caller = await cookieAuthority();
  if (!caller) throw new Error("Sign in to continue.");
  return caller;
}
export async function readLearningList(value: unknown) {
  const input = z.object({ academyId: z.guid(), page: z.number().int().min(0).max(4166).default(0), search: z.string().max(100).default("") }).parse(value);
  const caller = await learningCaller();
  const { data, error } = await caller.db.rpc("list_my_content_units", { p_academy_id: input.academyId, p_offset: input.page * 24, p_limit: 24, p_search: input.search });
  learningError(error);
  return { page: learningListSchema.parse(data), userId: caller.userId };
}
export async function readLearningUnit(value: unknown) {
  const input = unitInput.parse(value);
  const caller = await learningCaller();
  const { data, error } = await caller.db.rpc("get_my_content_unit", { p_academy_id: input.academyId, p_unit_id: input.unitId });
  learningError(error);
  return { unit: learningUnitSchema.parse(data), userId: caller.userId };
}
export async function readAccessWorkspace(value: unknown) {
  const input = unitInput.extend({ search: z.string().max(100).default(""), recordPage: z.number().int().min(0).max(4000).default(0), codePage: z.number().int().min(0).max(4000).default(0) }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { data, error } = await db.rpc("get_content_access_workspace", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_search: input.search, p_record_offset: input.recordPage * 25, p_code_offset: input.codePage * 25 });
  learningError(error); return workspaceSchema.parse(data);
}
export async function readAccessHistory(value: unknown) {
  const input = unitInput.extend({ recordId: z.guid() }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { data, error } = await db.rpc("get_content_access_history", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_record_id: input.recordId });
  learningError(error); return historySchema.parse(data);
}
