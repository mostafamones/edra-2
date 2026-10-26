import type { SearchRecord } from "@/lib/search";
export type SearchGroup = { label: string; records: SearchRecord[] };
export type SearchResponse = { userId: string; academyId: string; scope: string; groups: SearchGroup[]; unavailable: string[] };
export type SearchOutcome = { ok: true; value: SearchResponse } | { ok: false; message: string };

export { matchesSearch } from "@/lib/search";
export function commandShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "defaultPrevented" | "repeat">) {
  return event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing && !event.defaultPrevented && !event.repeat;
}
export function slashOpensSearch(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "defaultPrevented" | "repeat">, target: EventTarget | null) {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented || event.repeat) return false;
  return !(target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"]'));
}
