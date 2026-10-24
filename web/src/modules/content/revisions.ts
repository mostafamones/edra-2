import { KIND_LABELS, type ContentDocument } from "./types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Readable changes from the previous published document to the next one; the first revision has no previous. */
export function revisionChanges(previous: ContentDocument | null, next: ContentDocument): string[] {
  if (!previous) return [`Published with ${plural(next.items.length, "material")}`];
  const changes: string[] = [];
  if (previous.title !== next.title) changes.push(`Renamed from “${previous.title}” to “${next.title}”`);
  if (previous.description !== next.description) changes.push("Updated the description");
  if (previous.accessDays !== next.accessDays) changes.push(`Changed access from ${plural(previous.accessDays, "day")} to ${plural(next.accessDays, "day")}`);
  const before = new Map(previous.items.map(item => [item.id, item]));
  const after = new Map(next.items.map(item => [item.id, item]));
  for (const item of next.items) {
    const old = before.get(item.id);
    if (!old) changes.push(`Added ${KIND_LABELS[item.kind].toLowerCase()} “${item.title}”`);
    else if (old.title !== item.title) changes.push(`Renamed ${KIND_LABELS[item.kind].toLowerCase()} “${old.title}” to “${item.title}”`);
  }
  for (const item of previous.items) if (!after.has(item.id)) changes.push(`Removed ${KIND_LABELS[item.kind].toLowerCase()} “${item.title}”`);
  const kept = (items: ContentDocument["items"], other: Map<string, unknown>) => items.filter(item => other.has(item.id)).map(item => item.id).join();
  if (kept(previous.items, after) !== kept(next.items, before)) changes.push("Reordered the material");
  if ((previous.couponTypeId ?? null) !== (next.couponTypeId ?? null)) changes.push(next.couponTypeId ? (previous.couponTypeId ? "Changed the coupon type" : "Required a coupon") : "Removed the coupon requirement");
  const key = (r: NonNullable<ContentDocument["prerequisites"]>[number]) => `${r.unitId}:${r.kind}:${r.assessmentId}`;
  const oldRequired = new Set((previous.prerequisites ?? []).map(key)), newRequired = new Set((next.prerequisites ?? []).map(key));
  const added = [...newRequired].filter(k => !oldRequired.has(k)).length, removed = [...oldRequired].filter(k => !newRequired.has(k)).length;
  if (added) changes.push(`Added ${plural(added, "required submission")}`);
  if (removed) changes.push(`Removed ${plural(removed, "required submission")}`);
  return changes.length ? changes : ["Republished without changes"];
}
