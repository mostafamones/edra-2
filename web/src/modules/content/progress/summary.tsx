import { Progress } from "@/components/ui/progress";
import type { UnitProgress } from "./types";

export function LearningProgress({ progress }: { progress?: UnitProgress }) {
  if (!progress || !progress.total) return null;
  const percent = Math.floor(progress.completed / progress.total * 100);
  return <div className="space-y-2"><p className="text-sm tabular-nums">{progress.completed === progress.total ? "Completed" : `${progress.completed} of ${progress.total} completed`}</p><Progress aria-label="Unit completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${progress.completed} of ${progress.total} completed`} value={percent} /></div>;
}
