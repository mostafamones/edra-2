import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A window around real app screens filled with sample data. The content is `inert`: its links lead into the
 * signed-in app, and its landmarks must not compete with the landing page's own.
 */
export function AppFrame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <figure aria-label={label} className={cn("overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl shadow-primary/10", className)}>
      <div className="flex h-10 items-center gap-3 border-b bg-muted/40 px-4" aria-hidden="true">
        <span className="flex gap-1.5">{[0, 1, 2].map(dot => <span key={dot} className="size-2.5 rounded-full bg-foreground/15" />)}</span>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      <div inert className="select-none">{children}</div>
    </figure>
  );
}
