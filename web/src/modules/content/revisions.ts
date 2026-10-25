import { documentSchema, KIND_LABELS, type ContentDocument, type ContentItem } from "./types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const NOUNS: Record<ContentItem["kind"], string> = { explanation: "video", answer: "answer video", document: "document", assessment: "assessment" };

/** A headline, one short line per change, and the itemised material kept behind a toggle. */
export type ChangeSummary = { headline: string; lines: string[]; details: string[] };

/** "a video", "2 videos", or "3 materials" when the kinds are mixed. */
function countItems(items: ContentItem[]) {
  const kinds = new Set(items.map(item => item.kind));
  const noun = kinds.size === 1 ? NOUNS[items[0].kind] : "material";
  return items.length === 1 ? `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}` : plural(items.length, noun);
}

/** What changed from the previous document to the next one. An empty `headline` means nothing changed. */
export function revisionChanges(previous: ContentDocument | null, next: ContentDocument): ChangeSummary {
  if (!previous) return { headline: `Published with ${plural(next.items.length, "material")}`, lines: next.items.length ? [`+${next.items.length} Material`] : [], details: next.items.map(item => `${KIND_LABELS[item.kind]} “${item.title}”`) };
  const before = new Map(previous.items.map(item => [item.id, item]));
  const after = new Map(next.items.map(item => [item.id, item]));
  const added = next.items.filter(item => !before.has(item.id));
  const removed = previous.items.filter(item => !after.has(item.id));
  const renamed = next.items.flatMap(item => { const old = before.get(item.id); return old && old.title !== item.title ? [{ item, from: old.title }] : []; });
  const kept = (items: ContentItem[], other: Map<string, unknown>) => items.filter(item => other.has(item.id)).map(item => item.id).join();
  const reordered = kept(previous.items, after) !== kept(next.items, before);
  const title = previous.title !== next.title, description = previous.description !== next.description;
  const access = previous.accessDays !== next.accessDays;
  const oldCoupon = previous.couponTypeId ?? null, newCoupon = next.couponTypeId ?? null;
  const coupon = oldCoupon === newCoupon ? null : !newCoupon ? "removed" : oldCoupon ? "changed" : "required";
  const key = (r: NonNullable<ContentDocument["prerequisites"]>[number]) => `${r.unitId}:${r.kind}:${r.assessmentId}`;
  const oldRequired = new Set((previous.prerequisites ?? []).map(key)), newRequired = new Set((next.prerequisites ?? []).map(key));
  const requiredAdded = [...newRequired].filter(k => !oldRequired.has(k)).length, requiredRemoved = [...oldRequired].filter(k => !newRequired.has(k)).length;

  // Ordered by how much each change matters to a reader of the history.
  const phrases = [
    added.length && `Added ${countItems(added)}`,
    removed.length && `Removed ${countItems(removed)}`,
    title && "Renamed the unit",
    renamed.length && `Renamed ${countItems(renamed.map(r => r.item))}`,
    access && `Changed access to ${plural(next.accessDays, "day")}`,
    coupon && { required: "Required a coupon", removed: "Removed the coupon", changed: "Changed the coupon type" }[coupon],
    (requiredAdded || requiredRemoved) && "Updated required submissions",
    reordered && "Reordered the material",
    description && "Updated the description",
  ].filter((phrase): phrase is string => Boolean(phrase));
  const lower = (phrase: string) => phrase[0].toLowerCase() + phrase.slice(1);
  const headline = phrases.length <= 2 ? phrases.map((p, i) => i ? lower(p) : p).join(" and ") : `${phrases[0]}, ${lower(phrases[1])} and more`;

  const lines = [
    title && `Title “${previous.title}” → “${next.title}”`,
    description && "Description updated",
    added.length && `+${added.length} Material`,
    removed.length && `−${removed.length} Material`,
    renamed.length && `${renamed.length} Material renamed`,
    reordered && "Reordered",
    access && `Access ${previous.accessDays} → ${plural(next.accessDays, "day")}`,
    coupon && `Coupon ${coupon}`,
    requiredAdded && `+${plural(requiredAdded, "required submission")}`,
    requiredRemoved && `−${plural(requiredRemoved, "required submission")}`,
  ].filter((line): line is string => Boolean(line));

  const details = [
    ...added.map(item => `Added ${NOUNS[item.kind]} “${item.title}”`),
    ...removed.map(item => `Removed ${NOUNS[item.kind]} “${item.title}”`),
    ...renamed.map(({ item, from }) => `Renamed ${NOUNS[item.kind]} “${from}” → “${item.title}”`),
  ];
  return { headline, lines, details };
}

type Event<B> = { document: unknown; at: string; by: B };
type Author = { id: string } | null;
export type HistoryEntry<B> = { key: string; kind: "published" | "draft"; at: string; creators: B[]; reviewer: B | null; saves: number; summary: ChangeSummary | null };

/**
 * One timeline, newest first. A publication owns the draft saves made since the previous publication, so a unit
 * sent for review is one event: the people who saved the drafts created it and the publisher reviewed it (only when
 * they are someone else). Saves newer than the latest publication form a leading draft entry.
 */
export function historyEntries<B extends Author>(drafts: (Event<B> & { kind: "created" | "saved" })[], revisions: (Event<B> & { revision: number })[]): HistoryEntry<B>[] {
  // A save-and-publish stores its draft and publication in one transaction; the publication sorts first.
  const events = [...revisions.map(r => ({ ...r, kind: "published" as const, origin: null })), ...drafts.map(d => ({ ...d, origin: d.kind, kind: "draft" as const }))]
    .sort((a, b) => b.at.localeCompare(a.at) || (a.kind === b.kind ? 0 : a.kind === "published" ? -1 : 1));
  const groups: (typeof events)[] = [];
  for (const event of events) {
    if (event.kind === "published" || !groups.length) groups.push([event]); else groups.at(-1)!.push(event);
  }
  const parse = (value: unknown) => { const parsed = documentSchema.safeParse(value); return parsed.success ? parsed.data : undefined; };
  const only = (headline: string): ChangeSummary => ({ headline, lines: [], details: [] });
  const unique = (people: B[]) => [...new Map(people.map(person => [person?.id ?? null, person])).values()];
  return groups.map((group, index) => {
    const newest = group[0], saves = group.filter(e => e.kind === "draft");
    const before = groups[index + 1]?.[0];
    const current = parse(newest.document), previous = before ? parse(before.document) : null;
    let summary: ChangeSummary | null = null;
    // A document, or its predecessor, that no longer parses cannot be compared.
    if (current && previous !== undefined) {
      if (previous) {
        summary = revisionChanges(previous, current);
        if (!summary.headline) summary = only(newest.kind === "published" ? "Republished without changes" : "No changes since the last version");
      } else if (newest.kind === "published") summary = revisionChanges(null, current);
      else if (saves.at(-1)?.origin === "created") {
        // The creation snapshot is the starting point of a draft that has never been published.
        const created = parse(saves.at(-1)!.document);
        summary = created ? { ...(saves.length > 1 ? revisionChanges(created, current) : only("")), headline: "Created the unit" } : null;
      } else summary = only("Updated the draft");
    }
    // Publications from before drafts were recorded have no saves; their publisher is the only known creator.
    const creators = unique(saves.length ? saves.map(e => e.by) : [newest.by]);
    const reviewer = newest.kind === "published" && !creators.some(c => c?.id === newest.by?.id) ? newest.by : null;
    return { key: newest.kind === "published" ? `revision-${newest.revision}` : `draft-${index}`, kind: newest.kind, at: newest.at, creators, reviewer, saves: saves.length, summary };
  });
}

/** "Today, 3:21 AM", "Yesterday, 12:10 AM" or "Oct 23, 3:21 AM"; the year only when asked for. */
export function historyTime(at: string, now: Date, withYear: boolean) {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) })}, ${time}`;
}
