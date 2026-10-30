import type { ReactNode } from "react";
import { cn } from "cn";

type Props = {
  title: ReactNode;
  /** Sits at the far end of the row. */
  action?: ReactNode;
  as?: "h2" | "h3";
  size?: "sm" | "base";
  /** Drops the side padding, for titles that line up with the controls below them. */
  unpadded?: boolean;
};

/** A section's title, with an optional action. */
export function SectionHeader({ title, action, as: Heading = "h3", size = "sm", unpadded }: Props) {
  return (
    <div className={cn("flex items-center justify-between gap-3", !unpadded && "px-2")}>
      <Heading className={size === "base" ? "text-base font-semibold" : "text-sm font-medium"}>{title}</Heading>
      {action}
    </div>
  );
}
