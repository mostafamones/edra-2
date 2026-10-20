"use client";

import { IconPhotoOff, IconRefresh } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useImageUrl } from "./context";

/** One question image fitted inside a box, with loading and unavailable states. */
export function ImageFrame({ id, className }: { id: string; className?: string }) {
  const { url, loading, failed, retry } = useImageUrl(id);
  if (loading) return <Skeleton className={cn("w-full rounded-md", className)} />;
  if (failed || !url) {
    return (
      <div className={cn("flex w-full flex-col items-center justify-center gap-2 rounded-md bg-muted text-sm text-muted-foreground", className)}>
        <IconPhotoOff className="size-5" />This image is unavailable.
        <Button type="button" variant="outline" size="sm" onClick={retry}><IconRefresh />Try again</Button>
      </div>
    );
  }
  return (
    <div className={cn("flex w-full items-center justify-center overflow-hidden rounded-md bg-muted/40", className)}>
      {/* Signed Storage URLs expire, so next/image optimisation and caching don't apply. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
}
