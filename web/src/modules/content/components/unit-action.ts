import { FloppyDiskIcon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { changeUnit, saveUnitVersion } from "../actions";
import { unwrapContent, type ContentUnit } from "../types";

export type UnitAction = "version" | "publish" | "submit";

export const UNIT_ACTIONS = {
  version: { label: "Save version", icon: FloppyDiskIcon, done: "Version saved." },
  publish: { label: "Publish changes", icon: Tick02Icon, done: "Changes published." },
  submit: { label: "Send for review", icon: SentIcon, done: "Sent for review." },
} satisfies Record<UnitAction, { label: string; icon: unknown; done: string }>;

/** The one next step for a unit's working draft: a version until it's first published, then publishing (or asking a manager to) any edits. */
export function unitAction(unit: Pick<ContentUnit, "published_revision">, { editable, manager, changed }: { editable: boolean; manager: boolean; changed: boolean }): UnitAction | null {
  if (!editable) return null;
  if (!unit.published_revision) return "version";
  if (!changed) return null;
  return manager ? "publish" : "submit";
}

export async function runUnitAction(target: { academyId: string; unitId: string; version: number }, action: UnitAction) {
  unwrapContent(action === "version" ? await saveUnitVersion(target) : await changeUnit({ ...target, action }));
}
