import { formatScore } from "@/lib/score";
import type { FastMark, MarkPart } from "./types";

export type MarkSnapshot = { values: Record<string, string>; fast: Record<string, { score: string; excused: boolean; reason: string }>; feedback: string };
export type MarkBaseline = { version: string; basis: string; snapshot: MarkSnapshot };

export function markSnapshot(parts: MarkPart[], saved: Record<string, string>, feedback: string, marks: FastMark[] = []): MarkSnapshot {
  return {
    values: Object.fromEntries(parts.flatMap((part) => part.questions.map((q) => [q.id, saved[q.id] ?? ""]))), feedback,
    fast: Object.fromEntries(parts.map((part) => {
      const mark = marks.find((entry) => entry.partId === part.id && !entry.fromAnswers);
      return [part.id, { score: mark && !mark.requiresRemark ? formatScore(mark.score) : "", excused: mark?.kind === "excused", reason: mark?.reason ?? "" }];
    })),
  };
}

/** A basis excludes display notes and permission locks; it includes every scoring decision. */
export function scoringBasis(parts: MarkPart[], revision: number) {
  return JSON.stringify([revision, parts.map((p) => [p.id, p.entry, p.maxScore, p.questions.map((q) => [q.id, q.maxScore, Boolean(q.excluded), q.choices.map((c) => [c.id, c.isCorrect])])])]);
}

function normalized(snapshot: MarkSnapshot, parts: MarkPart[]) {
  const manual = new Set(parts.filter((p) => p.entry === "manual").flatMap((p) => p.questions.map((q) => q.id)));
  return {
    values: Object.entries(snapshot.values).sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => [id, manual.has(id) ? formatScore(v.trim()) : v.trim()]),
    fast: Object.entries(snapshot.fast).sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => [id, formatScore(v.score.trim()), v.excused, v.excused ? v.reason.trim() : ""]),
    feedback: snapshot.feedback,
  };
}
export const sameSnapshot = (a: MarkSnapshot, b: MarkSnapshot, parts: MarkPart[]) => JSON.stringify(normalized(a, parts)) === JSON.stringify(normalized(b, parts));

/** Adopt remote fields only where the user has not edited them since the submitted/baseline snapshot. */
export function reconcileSnapshot(current: MarkSnapshot, before: MarkSnapshot, acknowledged: MarkSnapshot): MarkSnapshot {
  const merge = (now: Record<string, string>, old: Record<string, string>, next: Record<string, string>) => Object.fromEntries(
    [...new Set([...Object.keys(now), ...Object.keys(next)])].map((id) => [id, now[id] === old[id] ? next[id] ?? "" : now[id] ?? ""]),
  );
  return {
    values: merge(current.values, before.values, acknowledged.values),
    fast: Object.fromEntries([...new Set([...Object.keys(current.fast), ...Object.keys(acknowledged.fast)])].map((id) => {
      const now = current.fast[id]; const old = before.fast[id]; const next = acknowledged.fast[id];
      return [id, !now || JSON.stringify(now) === JSON.stringify(old) ? next : now];
    })),
    feedback: current.feedback === before.feedback ? acknowledged.feedback : current.feedback,
  };
}

/** Work/draft versions only move forward; an older query response cannot become a new baseline. */
export function olderVersion(candidate: string, current: string) {
  const tuple = (value: string): number[] => { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [parsed]; };
  const a = tuple(candidate); const b = tuple(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
