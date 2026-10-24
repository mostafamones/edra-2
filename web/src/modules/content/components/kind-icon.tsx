import { HugeiconsIcon } from "@hugeicons/react";
import { File02Icon, Task01Icon, Video01Icon, VideoReplayIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { ContentItem } from "../types";

export const KIND_ICONS = { explanation: Video01Icon, answer: VideoReplayIcon, document: File02Icon, assessment: Task01Icon };
const TINTS = {
  explanation: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  answer: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  document: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  assessment: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

/** A tinted tile identifying a material's kind at a glance. */
export function KindIcon({ kind, className }: { kind: ContentItem["kind"]; className?: string }) {
  return <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TINTS[kind], className)}>
    <HugeiconsIcon icon={KIND_ICONS[kind]} strokeWidth={1.5} className="size-5" aria-hidden="true" />
  </span>;
}
