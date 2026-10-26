import { HugeiconsIcon } from "@hugeicons/react";
import { File02Icon, FileValidationIcon, Task01Icon, Video01Icon, VideoReplayIcon } from "@hugeicons/core-free-icons";
import type { ContentItem } from "../types";

export const KIND_ICONS = { explanation: Video01Icon, answer: VideoReplayIcon, document: File02Icon, assessment: Task01Icon };
/** An answer's icon depends on whether it is a video or a document. */
export const kindIcon = (kind: ContentItem["kind"], document?: boolean) => kind === "answer" && document ? FileValidationIcon : KIND_ICONS[kind];

/** The icon tile identifying a material's kind. */
export function KindIcon({ kind, document, small }: { kind: ContentItem["kind"]; document?: boolean; small?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ${small ? "size-8" : "size-10"}`}>
    <HugeiconsIcon icon={kindIcon(kind, document)} strokeWidth={1.5} className={small ? "size-4" : "size-5"} aria-hidden="true" />
  </span>;
}
