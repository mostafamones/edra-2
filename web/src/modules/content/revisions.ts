import { documentSchema, KIND_LABELS, type ContentDocument } from "./types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Readable changes from the previous document to the next one; the first publication has no previous. */
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
  return changes;
}

type Event<B> = { document: unknown; at: string; by: B };
export type HistoryEntry<B> = { key: string; kind: "published" | "created" | "saved"; revision?: number; at: string; by: B; changes: string[] | null };

/**
 * One timeline of stored drafts and publications, newest first. A publication is compared with the previous
 * publication (what students saw change); a draft with whatever was stored just before it.
 */
export function historyEntries<B>(drafts: (Event<B> & { kind: "created" | "saved" })[], revisions: (Event<B> & { revision: number })[]): HistoryEntry<B>[] {
  // A save-and-publish stores its draft and publication in one transaction; the publication sorts first.
  const events = [...revisions.map(r => ({ ...r, kind: "published" as const })), ...drafts.map(d => ({ ...d, origin: d.kind, kind: "draft" as const }))]
    .sort((a, b) => b.at.localeCompare(a.at) || (a.kind === b.kind ? 0 : a.kind === "published" ? -1 : 1));
  const parse = (value: unknown) => { const parsed = documentSchema.safeParse(value); return parsed.success ? parsed.data : undefined; };
  return events.map((event, index) => {
    const current = parse(event.document);
    const earlier = events.slice(index + 1).find(e => event.kind === "draft" || e.kind === "published");
    const previous = earlier ? parse(earlier.document) : null;
    let changes: string[] | null = null;
    // A document, or its predecessor, that no longer parses cannot be compared.
    if (current && previous !== undefined) {
      if (previous) { changes = revisionChanges(previous, current); if (!changes.length) changes = [event.kind === "published" ? "Republished without changes" : "Saved without changes"]; }
      else if (event.kind === "published") changes = revisionChanges(null, current);
      else changes = [event.origin === "created" ? "Created the unit" : "Saved the draft"];
    }
    return { key: event.kind === "published" ? `revision-${event.revision}` : `draft-${index}`, kind: event.kind === "published" ? event.kind : event.origin, revision: event.kind === "published" ? event.revision : undefined, at: event.at, by: event.by, changes };
  });
}
