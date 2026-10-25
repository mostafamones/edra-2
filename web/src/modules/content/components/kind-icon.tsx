import { HugeiconsIcon } from "@hugeicons/react";
import { File02Icon, Task01Icon, Video01Icon, VideoReplayIcon } from "@hugeicons/core-free-icons";
import type { ContentItem } from "../types";

export const KIND_ICONS = { explanation: Video01Icon, answer: VideoReplayIcon, document: File02Icon, assessment: Task01Icon };

/** The icon tile identifying a material's kind. */
export function KindIcon({ kind, small }: { kind: ContentItem["kind"]; small?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ${small ? "size-8" : "size-10"}`}>
    <HugeiconsIcon icon={KIND_ICONS[kind]} strokeWidth={1.5} className={small ? "size-4" : "size-5"} aria-hidden="true" />
  </span>;
}
