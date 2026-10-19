import { newUuid } from "@/lib/uuid";

type Node = Record<string, unknown>;
const object = (value: unknown): value is Node => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Client-only identities survive insertion/reordering while the server allocates persistent IDs. */
export function identifyDraft<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => object(item) ? identifyDraft({ ...item, _draftId: item._draftId ?? newUuid() }) : item) as T;
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, identifyDraft(child)])) as T;
  return value;
}

/** Match the returned IDs to the submitted objects, then to their current identity, never current index. */
export function adoptStoredIds<T>(submitted: T, stored: T, current: T): T {
  if (Array.isArray(submitted) && Array.isArray(stored) && Array.isArray(current)) {
    return current.map((item) => {
      if (!object(item)) return item;
      const index = submitted.findIndex((before) => object(before) && (item._draftId ? item._draftId === before._draftId : item.id && item.id === before.id));
      return index < 0 || !object(stored[index]) ? item : adoptStoredIds(submitted[index], stored[index], item);
    }) as T;
  }
  if (object(submitted) && object(stored) && object(current)) {
    const next: Node = { ...current };
    if (stored.id && (!current.id || current.id === submitted.id)) next.id = stored.id;
    for (const key of Object.keys(current)) if (key !== "id" && key in submitted && key in stored) next[key] = adoptStoredIds(submitted[key], stored[key], current[key]);
    return next as T;
  }
  return current;
}

/** A duplicate/undo after deletion must not share either a server ID or an in-flight client identity. */
export function detachDraft<T>(value: T): T {
  if (Array.isArray(value)) return value.map(detachDraft) as T;
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "_draftId").map(([key, child]) => [key, detachDraft(child)])) as T;
  return value;
}
