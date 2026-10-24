import type { ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "cn";

/** One icon-led line in a card's footer; the term is for screen readers only. */
export function CardFact({ icon, label, className, children }: { icon: IconSvgElement; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <dt className="sr-only">{label}</dt>
      <HugeiconsIcon icon={icon} className="size-3.5 shrink-0" aria-hidden="true" />
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
