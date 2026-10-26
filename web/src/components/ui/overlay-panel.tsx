import type { ComponentProps } from "react"
import { cn } from "cn"

/**
 * Side panel floating over page content on the right edge of the nearest positioned ancestor, lifted by a soft shadow.
 * Give it an aria-label.
 */
function OverlayPanel({ className, children, ...props }: ComponentProps<"aside">) {
  return (
    <aside data-slot="overlay-panel" className={cn("absolute inset-y-0 right-0 z-20 w-72 border-l bg-background shadow-[-16px_0_40px_-16px_rgb(0_0_0/0.35)] animate-in fade-in slide-in-from-right-4 duration-200", className)} {...props}>
      {/* Matches the page's padding and section gap so the panel's first row lines up with the page toolbar. */}
      <div className="sticky top-(--header-height,4rem) flex h-[calc(100svh-var(--header-height,4rem))] flex-col gap-(--page-section-gap) overflow-y-auto px-6 py-(--page-padding-y)">
        {children}
      </div>
    </aside>
  )
}

export { OverlayPanel }
