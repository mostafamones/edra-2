"use client";

import { IconLoader, IconPhoto, IconPhotoOff } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useImageUrl } from "./context";
import { ImageFrame } from "./frame";

/** An inline image chip inside a question field: hover previews the image, click opens the viewer. */
export function ImageBadge({ id, number, onOpen }: { id: string; number: number; onOpen: () => void }) {
  const { loading, failed } = useImageUrl(id);
  const Icon = loading ? IconLoader : failed ? IconPhotoOff : IconPhoto;
  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <span data-image-id={id} contentEditable={false} className="mx-0.5 inline-flex align-baseline select-none"
          onMouseDown={(event) => event.preventDefault()} onClick={onOpen}>
          <Badge variant={failed ? "destructive" : "secondary"} className="cursor-pointer" asChild>
            <button type="button" aria-label={`Image ${number}, open viewer`}>
              <Icon className={loading ? "animate-spin" : undefined} />Image {number}
            </button>
          </Badge>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-2">
        <ImageFrame id={id} className="h-44" />
      </HoverCardContent>
    </HoverCard>
  );
}
