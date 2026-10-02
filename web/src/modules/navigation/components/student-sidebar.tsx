"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

import { STUDENT_GROUPS } from "../manifest";
import { AccountMenu } from "./account-menu";
import { SidebarNavigation } from "./sidebar-nav";

export function StudentSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/learn" className="flex h-12 items-center gap-2 rounded-md px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Edra Learning</span>
        </Link>
      </SidebarHeader>
      <SidebarContent><SidebarNavigation groups={STUDENT_GROUPS} /></SidebarContent>
      <SidebarFooter><AccountMenu portal="student" /></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
