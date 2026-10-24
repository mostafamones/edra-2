"use server";
import { z } from "zod";
import { contentCaller, contentError, contentResult, readContentUnit, readContentWorkspace } from "./data";
import { documentSchema } from "./types";

export async function loadWorkspace(academyId: string) { return readContentWorkspace(academyId); }
export async function loadUnit(academyId: string, unitId: string) { return readContentUnit(academyId, unitId); }
const scopeSchema = z.object({ academyId: z.guid(), yearId: z.guid(), levelId: z.string().min(1), trackId: z.guid().nullable(), unitId: z.guid() });
export async function createUnit(value: unknown) {
  return contentResult(async () => {
  const input = scopeSchema.extend({ title: z.string().trim().min(1).max(200) }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { error } = await db.rpc("create_content_unit", { p_academy_id: input.academyId, p_year_id: input.yearId, p_level_id: input.levelId, p_track_id: input.trackId!, p_unit_id: input.unitId, p_title: input.title });
  contentError(error); return input.unitId;
  });
}
export async function saveUnit(value: unknown) {
  return contentResult(async () => {
  const input = z.object({ academyId: z.guid(), unitId: z.guid(), version: z.number().int().positive(), document: documentSchema }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { error } = await db.rpc("save_content_unit", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_version: input.version, p_document: input.document }); contentError(error);
  });
}
export async function changeUnit(value: unknown) {
  return contentResult(async () => {
  const input = z.object({ academyId: z.guid(), unitId: z.guid(), version: z.number().int().positive(), action: z.enum(["submit", "publish", "archive", "restore", "feedback", "request_changes"]), feedback: z.string().max(5000).default("") }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { error } = await db.rpc("change_content_unit", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_version: input.version, p_action: input.action, p_feedback: input.feedback }); contentError(error);
  });
}
export async function publishUnitEdits(value: unknown) {
  return contentResult(async () => {
    const input = z.object({ academyId: z.guid(), unitId: z.guid(), version: z.number().int().positive(), document: documentSchema }).parse(value);
    const { db } = await contentCaller(input.academyId);
    const { error } = await db.rpc("publish_content_edits", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_version: input.version, p_document: input.document });
    contentError(error);
  });
}
export async function copyUnit(value: unknown) {
  return contentResult(async () => {
  const input = scopeSchema.extend({ sourceId: z.guid() }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { error } = await db.rpc("copy_content_unit", { p_academy_id: input.academyId, p_source_id: input.sourceId, p_year_id: input.yearId, p_level_id: input.levelId, p_track_id: input.trackId!, p_unit_id: input.unitId }); contentError(error); return input.unitId;
  });
}
export async function assessmentOptions(academyId: string, unitId: string) {
  z.guid().parse(unitId); const { db } = await contentCaller(academyId);
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.rpc("content_assessment_options", { p_academy_id: academyId, p_unit_id: unitId, p_offset: offset, p_limit: 100 });
    contentError(error);
    const rows = z.array(z.object({ id: z.guid(), title: z.string(), kind: z.enum(["assignment", "quiz", "exam"]) })).parse(data);
    all.push(...rows);
    if (rows.length < 100) return all;
  }
}

export async function reuseMaterial(value: unknown) {
  return contentResult(async () => {
  const input = z.object({ academyId: z.guid(), unitId: z.guid(), version: z.number().int().positive(), sourceId: z.guid(), itemId: z.guid() }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { error } = await db.rpc("copy_content_material", { p_academy_id: input.academyId, p_source_id: input.sourceId, p_item_id: input.itemId, p_target_id: input.unitId, p_version: input.version }); contentError(error);
  });
}
export async function createAttachedAssessment(value: unknown) {
  return contentResult(async () => {
  const input = z.object({ academyId: z.guid(), unitId: z.guid(), version: z.number().int().positive(), kind: z.enum(["assignment", "quiz", "exam"]), title: z.string().trim().min(1).max(200) }).parse(value);
  const { db } = await contentCaller(input.academyId);
  const { data, error } = await db.rpc("create_content_assessment", { p_academy_id: input.academyId, p_unit_id: input.unitId, p_version: input.version, p_kind: input.kind, p_title: input.title }); contentError(error); return data!;
  });
}
