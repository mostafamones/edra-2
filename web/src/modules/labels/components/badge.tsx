import { cn } from "@/lib/utils";
import { PALETTE, paletteChip, type PaletteKey } from "@/lib/palette";
import { Badge } from "@/components/ui/badge";
import type { Label } from "../types";

/** The palette indicator dot. Decorative: the label or color name is always written beside it. */
export function LabelSwatch({ color, className }: { color: PaletteKey; className?: string }) {
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", PALETTE[color].indicator, className)} />;
}

/** One label, in its palette colors with its name. */
export function LabelBadge({ label }: { label: Label }) {
  return (
    <Badge variant="secondary" className={cn("max-w-40 shrink font-normal", paletteChip(label.color))}>
      <span className="truncate">{label.name}</span>
    </Badge>
  );
}

/** A record's labels as a list; renders nothing without labels. */
export function LabelBadges({ labels, className }: { labels: readonly Label[]; className?: string }) {
  if (labels.length === 0) return null;
  return (
    <ul aria-label="Labels" className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {labels.map((label) => <li key={label.id} className="flex min-w-0"><LabelBadge label={label} /></li>)}
    </ul>
  );
}
