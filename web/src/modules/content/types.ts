import { z } from "zod";

export const itemSchema = z.object({
  id: z.guid(), kind: z.enum(["explanation", "document", "assessment", "answer"]),
  title: z.string().trim().min(1).max(250), assetId: z.guid().optional(),
  assessmentKind: z.enum(["assignment", "quiz", "exam"]).optional(), assessmentId: z.guid().optional(),
  // An attached document belongs to the nearest explanation video stored before it.
  attached: z.literal(true).optional(),
}).strict().superRefine((item, ctx) => {
  if (item.attached && item.kind !== "document") ctx.addIssue({ code: "custom", message: "Only documents attach to a video.", path: ["attached"] });
  if (item.kind !== "assessment" && !item.assetId) ctx.addIssue({ code: "custom", message: "Choose a file.", path: ["assetId"] });
  if ((item.kind === "assessment" || item.kind === "answer") && (!item.assessmentId || !item.assessmentKind))
    ctx.addIssue({ code: "custom", message: "Choose an assessment.", path: ["assessmentId"] });
});
export const accessDaysSchema = z.number().int().min(1, "Enter at least one day.").max(2147483647, "Enter fewer days.");
export const prerequisiteSchema = z.object({ unitId: z.guid(), kind: z.enum(["access", "assignment", "quiz"]), assessmentId: z.guid().optional() }).strict().superRefine((value, ctx) => {
  if ((value.kind === "access") !== (value.assessmentId === undefined)) ctx.addIssue({ code: "custom", message: "Choose a valid prerequisite.", path: ["assessmentId"] });
});
export const documentSchema = z.object({ title: z.string().trim().min(1, "Enter a title.").max(200), description: z.string().max(10000), accessDays: accessDaysSchema.default(7), items: z.array(itemSchema).max(200), couponTypeId: z.guid().nullable().optional(), prerequisites: z.array(prerequisiteSchema).max(100).optional() }).strict().superRefine((document, ctx) => {
  if (new Set(document.items.map(i => i.id)).size !== document.items.length) ctx.addIssue({ code: "custom", message: "Material identities must be unique.", path: ["items"] });
  let parent: ContentItem["kind"] | undefined;
  for (const item of document.items) {
    if (!item.attached) parent = item.kind;
    else if (parent !== "explanation") ctx.addIssue({ code: "custom", message: "Attach documents to an explanation video.", path: ["items"] });
  }
});
export type ContentDocument = z.infer<typeof documentSchema>;
export type ContentItem = z.infer<typeof itemSchema>;
export function unattachedUploads<T extends { id: string; unit_id: string }>(assets: T[], unitId: string, items: ContentItem[]) {
  const attached = new Set(items.map(item => item.assetId));
  return assets.filter(asset => asset.unit_id === unitId && !attached.has(asset.id));
}
/** A unit's material by kind. An assessment counts as answered once any answer material sits under it. */
export function materialSummary(items: ContentItem[]) {
  const answered = new Set(items.flatMap(item => item.kind === "answer" ? [item.assessmentId] : []));
  const assessments = (kind: ContentItem["assessmentKind"]) => items.filter(item => item.kind === "assessment" && item.assessmentKind === kind).map(item => ({ title: item.title, answered: answered.has(item.assessmentId) }));
  const titles = (kind: ContentItem["kind"]) => items.filter(item => item.kind === kind).map(item => ({ title: item.title }));
  return {
    videos: titles("explanation"), assignments: assessments("assignment"), quizzes: assessments("quiz"), exams: assessments("exam"), files: titles("document"),
  };
}
/** A prerequisite's assessment comes from the source unit's working draft; removed ones fall back to their kind. */
export function prerequisiteName(prerequisite: NonNullable<ContentDocument["prerequisites"]>[number], units: Pick<ContentUnit, "id" | "draft">[]) {
  const unit = units.find(u => u.id === prerequisite.unitId);
  const title = unit?.draft.title ?? "Unavailable unit";
  if (prerequisite.kind === "access") return title;
  const assessment = unit?.draft.items.find(item => item.kind === "assessment" && item.assessmentId === prerequisite.assessmentId);
  return `${assessment?.title ?? (prerequisite.kind === "quiz" ? "Quiz" : "Assignment")} · ${title}`;
}
export type ProgramScope ={ yearId: string; levelId: string; trackId: string | null };
export type ContentUnit = { id: string; academy_id: string; program_id: string; created_by: string; updated_at: string; version: number; state: "draft" | "review" | "published" | "archived"; published_revision: number; published_version: number; review_requested_at: string | null; draft: ContentDocument };
export const STATE_LABELS = { draft: "Draft", review: "In review", published: "Published", archived: "Archived" };
export const UNIT_STATUSES = ["draft", "review", "published"] as const;
export type UnitView = { group: "none" | "program" | "status"; sort: "updated" | "title"; statuses: readonly (typeof UNIT_STATUSES)[number][]; labels: string[]; unlabeled: boolean };
export const DEFAULT_UNIT_VIEW: UnitView = { group: "none", sort: "updated", statuses: UNIT_STATUSES, labels: [], unlabeled: false };
/** Any of the selected labels, or Unlabeled instead of them. */
export function matchesLabels(labelIds: readonly string[], { labels, unlabeled }: Pick<UnitView, "labels" | "unlabeled">) {
  if (unlabeled) return labelIds.length === 0;
  return labels.length === 0 || labels.some(label => labelIds.includes(label));
}
/** A published unit awaiting review matches either of its two statuses. */
export function matchesStatuses(unit: Pick<ContentUnit, "state" | "review_requested_at">, statuses: UnitView["statuses"]) {
  return statuses.some(status => status === "review" ? isUnitInReview(unit) : unit.state === status);
}
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
/** Cards in display order, by group. `units` arrive newest first. Without grouping there is one unnamed group. */
export function arrangeUnits<T extends Pick<ContentUnit, "state" | "draft">>(units: T[], view: Pick<UnitView, "group" | "sort">, programOf: (unit: T) => string) {
  const sorted = view.sort === "title" ? [...units].sort((a, b) => byName(a.draft.title, b.draft.title)) : units;
  if (view.group === "none") return [{ label: "", units: sorted }];
  const groups = new Map<string, T[]>();
  for (const unit of sorted) {
    const label = view.group === "status" ? STATE_LABELS[unit.state] : programOf(unit);
    groups.set(label, [...(groups.get(label) ?? []), unit]);
  }
  const order = Object.values(STATE_LABELS);
  return [...groups].map(([label, units]) => ({ label, units })).sort((a, b) => view.group === "status" ? order.indexOf(a.label) - order.indexOf(b.label) : byName(a.label, b.label));
}
export const KIND_LABELS = { explanation: "Explanation video", answer: "Answer", document: "Document", assessment: "Assessment" };
export function canEditUnit(unit: Pick<ContentUnit, "created_by" | "published_revision" | "state">, userId: string, manager: boolean) {
  return unit.state !== "archived" && (manager || unit.created_by === userId);
}
export function isUnitInReview(unit: Pick<ContentUnit, "state" | "review_requested_at">) {
  return unit.state === "review" || unit.review_requested_at != null;
}
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export type ContentResult<T> = { ok: true; value: T } | { ok: false; message: string };
export function unwrapContent<T>(result: ContentResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
