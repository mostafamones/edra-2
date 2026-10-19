import { z } from "zod";

export const itemSchema = z.object({
  id: z.uuid(), kind: z.enum(["explanation", "document", "assessment", "answer"]),
  title: z.string().trim().min(1).max(250), assetId: z.uuid().optional(),
  assessmentKind: z.enum(["assignment", "quiz", "exam"]).optional(), assessmentId: z.uuid().optional(),
}).strict().superRefine((item, ctx) => {
  if (item.kind !== "assessment" && !item.assetId) ctx.addIssue({ code: "custom", message: "Choose a file.", path: ["assetId"] });
  if ((item.kind === "assessment" || item.kind === "answer") && (!item.assessmentId || !item.assessmentKind))
    ctx.addIssue({ code: "custom", message: "Choose an assessment.", path: ["assessmentId"] });
});
export const documentSchema = z.object({ title: z.string().trim().min(1, "Enter a title.").max(200), description: z.string().max(10000), items: z.array(itemSchema).max(200) }).strict().superRefine((document, ctx) => {
  if (new Set(document.items.map(i => i.id)).size !== document.items.length) ctx.addIssue({ code: "custom", message: "Material identities must be unique.", path: ["items"] });
});
export type ContentDocument = z.infer<typeof documentSchema>;
export type ContentItem = z.infer<typeof itemSchema>;
export function unattachedUploads<T extends { id: string; unit_id: string }>(assets: T[], unitId: string, items: ContentItem[]) {
  const attached = new Set(items.map(item => item.assetId));
  return assets.filter(asset => asset.unit_id === unitId && !attached.has(asset.id));
}
export type ProgramScope = { yearId: string; levelId: string; trackId: string | null };
export type ContentUnit = { id: string; academy_id: string; program_id: string; created_by: string; updated_at: string; version: number; state: "draft" | "review" | "published" | "archived"; published_revision: number; published_version: number; draft: ContentDocument };
export const STATE_LABELS = { draft: "Draft", review: "In review", published: "Published", archived: "Archived" };
export const KIND_LABELS = { explanation: "Explanation video", answer: "Answer video", document: "Document", assessment: "Assessment" };
export function canEditUnit(unit: Pick<ContentUnit, "created_by" | "published_revision" | "state">, userId: string, manager: boolean) {
  return unit.state !== "archived" && (manager || (unit.created_by === userId && unit.published_revision === 0));
}
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export type ContentResult<T> = { ok: true; value: T } | { ok: false; message: string };
export function unwrapContent<T>(result: ContentResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
