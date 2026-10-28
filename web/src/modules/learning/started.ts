type Progress = { items: { completed: boolean; watchedSeconds?: number }[]; completed?: number; total?: number };

/** Started means at least one item was completed or partly watched. */
export function unitStarted(unit: { progress?: Progress }) {
  return unit.progress?.items.some((item) => item.completed || (item.watchedSeconds ?? 0) > 0) ?? false;
}

/** Finished covers both completed courses (every tracked item done) and expired ones, including access whose end has passed since it was read. */
export function unitFinished(unit: { progress?: Progress; access: { status: string; expiresAt?: string | null } }, now = Date.now()) {
  return unitStatus(unit, now) !== "active";
}

export const UNIT_STATUSES = ["active", "finished", "completed", "expired"] as const;
export type UnitStatus = typeof UNIT_STATUSES[number];

/** Finished means completion and expiry coincide; the other statuses are exclusive. */
export function unitStatus(unit: { progress?: Progress; access: { status: string; expiresAt?: string | null } }, now = Date.now()): UnitStatus {
  const { completed = 0, total = 0 } = unit.progress ?? {};
  const expired = unit.access.status === "expired" || (unit.access.status === "active" && !!unit.access.expiresAt && new Date(unit.access.expiresAt).getTime() <= now);
  const complete = total > 0 && completed === total;
  if (complete && expired) return "finished";
  if (complete) return "completed";
  return expired ? "expired" : "active";
}
