import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";

/** Stands in for a video asset that has no provider media yet. */
export function PlaceholderVideo({ title }: { title: string }) {
  return (
    <div role="img" aria-label={`Placeholder video: ${title}`} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border bg-muted text-muted-foreground">
      <HugeiconsIcon icon={PlayIcon} strokeWidth={1.5} className="size-10" aria-hidden="true" />
      <p className="text-sm font-medium">Placeholder video</p>
    </div>
  );
}
