import { SidebarLeft01Icon, SidebarLeftIcon, SidebarRight01Icon, SidebarRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import styles from "./sidebar-icon.module.css";

export function SidebarIcon({ open, side = "left" }: { open: boolean; side?: "left" | "right" }) {
  return (
    <span className={styles.icon} data-open={open} data-side={side} aria-hidden="true">
      <HugeiconsIcon className={styles.closed} icon={side === "left" ? SidebarLeftIcon : SidebarRightIcon} strokeWidth={1.5} />
      <HugeiconsIcon className={styles.open} icon={side === "left" ? SidebarLeft01Icon : SidebarRight01Icon} strokeWidth={1.5} />
    </span>
  );
}
