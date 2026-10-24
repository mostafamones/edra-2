"use client";

import { useLayoutEffect, useState, type ComponentProps, type CSSProperties } from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const GAP = 8;

type Bounds = { top: number; left: number; width: number; height: number };

/** The sidebar inset's box in the viewport, or the whole viewport outside the app shell. */
function useInsetBounds() {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const rect = document.querySelector("[data-slot=sidebar-inset]")?.getBoundingClientRect();
      setBounds(rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return bounds;
}

/**
 * Sheet content that floats as a rounded card inside the sidebar inset instead of docking to the viewport edge.
 * It shares the sheet's behaviour: slides in, dims the inset, and closes on outside click or Escape.
 */
function FloatingSheetContent({ className, children, showCloseButton = true, ...props }: ComponentProps<typeof SheetPrimitive.Content> & { showCloseButton?: boolean }) {
  const bounds = useInsetBounds();
  const area: CSSProperties | undefined = bounds ?? undefined;
  const card: CSSProperties | undefined = bounds ? { top: bounds.top + GAP, bottom: window.innerHeight - bounds.top - bounds.height + GAP, right: window.innerWidth - bounds.left - bounds.width + GAP, maxWidth: bounds.width - GAP * 2 } : undefined;
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay style={area} className="fixed z-50 bg-black/10 duration-150 supports-backdrop-filter:backdrop-blur-xs md:rounded-xl data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <SheetPrimitive.Content
        data-slot="floating-sheet-content"
        style={card}
        className={cn("fixed z-50 flex w-md flex-col gap-4 overflow-hidden rounded-xl border bg-popover bg-clip-padding text-sm text-popover-foreground shadow-xl duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right-8 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right-8", className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-4 right-4">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { FloatingSheetContent };
export { Sheet as FloatingSheet, SheetTrigger as FloatingSheetTrigger, SheetClose as FloatingSheetClose, SheetHeader as FloatingSheetHeader, SheetFooter as FloatingSheetFooter, SheetTitle as FloatingSheetTitle, SheetDescription as FloatingSheetDescription } from "@/components/ui/sheet";
