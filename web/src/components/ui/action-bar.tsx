import type { ComponentProps } from "react"
import { cn } from "cn"
import { Separator } from "@/components/ui/separator"

/** Floating toolbar pinned to the viewport bottom, for selection and unsaved-change actions. Give it an aria-label. */
function ActionBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="region"
      data-slot="action-bar"
      className={cn("fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border bg-popover p-1.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2", className)}
      {...props}
    />
  )
}

function ActionBarSeparator({ className, ...props }: ComponentProps<typeof Separator>) {
  return <Separator orientation="vertical" data-slot="action-bar-separator" className={cn("mx-1 h-5! self-center!", className)} {...props} />
}

export { ActionBar, ActionBarSeparator }
