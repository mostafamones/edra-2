import type { ReactNode } from "react";

/** A section's title, with an optional action at the far end of its row. */
export function SectionHeader({ title, action, as: Heading = "h3" }: { title: string; action?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2">
      <Heading className="text-sm font-medium">{title}</Heading>
      {action}
    </div>
  );
}
