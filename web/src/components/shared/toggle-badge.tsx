import type { ComponentProps } from "react";

import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/** A badge-sized toggle for filters: neutral, and a brighter neutral when pressed so it never reads as a palette color. */
export function ToggleBadge({ className, ...props }: ComponentProps<typeof Toggle>) {
  return <Toggle size="sm" className={cn("h-6 max-w-40 min-w-0 gap-1.5 rounded-sm bg-muted/60 px-2 text-xs font-normal text-muted-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground aria-pressed:hover:bg-foreground/15", className)} {...props} />;
}
