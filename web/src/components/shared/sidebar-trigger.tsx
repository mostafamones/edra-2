"use client";

import type { ComponentProps } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { SidebarIcon } from "./sidebar-icon";

export function SidebarTrigger({ className, onClick, ...props }: ComponentProps<typeof Button>) {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : open;

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      size="icon-sm"
      aria-label="Toggle Sidebar"
      aria-expanded={expanded}
      {...props}
      variant="ghost"
      className={cn("aria-expanded:bg-transparent aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
    >
      <SidebarIcon open={expanded} />
    </Button>
  );
}
