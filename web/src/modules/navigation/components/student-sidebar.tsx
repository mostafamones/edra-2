"use client";
import { useCanonicalHref } from "../use-routing";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBuilding, IconClipboardText, IconFileCertificate, IconSchool as GraduationCap } from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { studentAcademyPath } from "@/lib/routing";

import { STUDENT_GROUPS } from "../manifest";
import { AccountMenu } from "./account-menu";
import { SidebarNavigation } from "./sidebar-nav";

/** Academies the student is connected to; each links to its academy home. */
export type StudentSidebarAcademy = { name: string; slug: string };

export function StudentSidebar({ academies = [] }: { academies?: StudentSidebarAcademy[] }) {
  const href = useCanonicalHref();
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href={href("/learn")} className="flex h-12 items-center gap-2 rounded-md px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Edra Learning</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {academies.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Academies</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {academies.map((academy) => {
                  const home = studentAcademyPath(academy.slug);
                  const exams = studentAcademyPath(academy.slug, "exams");
                  const assignments = studentAcademyPath(academy.slug, "assignments");
                  return (
                    <SidebarMenuItem key={academy.slug}>
                      <SidebarMenuButton asChild tooltip={academy.name} isActive={pathname === home || pathname.startsWith(`${home}/`)}>
                        <Link href={home}>
                          <IconBuilding aria-hidden="true" />
                          <span>{academy.name}</span>
                        </Link>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === assignments || pathname.startsWith(`${assignments}/`)}>
                            <Link href={assignments}><IconClipboardText aria-hidden="true" /><span>Assignments</span></Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === exams || pathname.startsWith(`${exams}/`)}>
                            <Link href={exams}><IconFileCertificate aria-hidden="true" /><span>Exams</span></Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarNavigation groups={STUDENT_GROUPS} />
      </SidebarContent>
      <SidebarFooter><AccountMenu portal="student" /></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
