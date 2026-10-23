"use client";
import { useCanonicalHref, usePortalPath } from "../use-routing";

import Link from "next/link";
import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { IconBuilding, IconSchool as GraduationCap } from "@tabler/icons-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AssignmentsIcon, Calendar03Icon, FolderLibraryIcon, Home07Icon, Task01Icon, TeachingIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

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
  useSidebar,
} from "@/components/ui/sidebar";

import { studentAcademyPath } from "@/lib/routing";

import { STUDENT_GROUPS } from "../manifest";
import { PortalFooter } from "./portal-footer";

const studentIcons: Record<string, ComponentProps<typeof HugeiconsIcon>["icon"]> = {
  "/learn": Home07Icon,
  "/learn/calendar": Calendar03Icon,
  "/learn/content": FolderLibraryIcon,
  "/learn/assignments": AssignmentsIcon,
  "/learn/quizzes": Task01Icon,
  "/learn/attendance": TeachingIcon,
  "/learn/results": Task01Icon,
};

/** Academies the student is connected to; each links to its academy home. */
export type StudentSidebarAcademy = { name: string; slug: string };

export function StudentSidebar({ academies = [] }: { academies?: StudentSidebarAcademy[] }) {
  const href = useCanonicalHref();
  const pathname = usePathname();
  const studentPath = usePortalPath("student");
  const { open, isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);
  return (
    <Sidebar collapsible="icon" variant="inset" className="group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]">
      <SidebarHeader>
        <Link href={href("/learn")} onClick={closeMobile} className="flex h-12 items-center gap-2 rounded-md px-2 font-(family-name:--font-poppins) text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Edra Learning</span>
        </Link>
        <div className="mt-2 flex px-1 group-data-[collapsible=icon]:hidden">
          <Button type="button" variant="outline" size="sm" aria-label="Command Menu"
            className="min-w-0 flex-1 justify-start border-border! text-sidebar-foreground/75">
            <span className="truncate font-normal">Search</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className={open || isMobile ? "px-1" : ""}>
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
                      <SidebarMenuButton asChild tooltip={academy.name} isActive={pathname === home || pathname.startsWith(`${home}/`)} className="text-sidebar-foreground/75">
                        <Link href={home} onClick={closeMobile} aria-current={pathname === home ? "page" : undefined}>
                          <IconBuilding aria-hidden="true" />
                          <span>{academy.name}</span>
                        </Link>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === assignments || pathname.startsWith(`${assignments}/`)} className="text-sidebar-foreground/75">
                            <Link href={assignments} onClick={closeMobile} aria-current={pathname === assignments ? "page" : undefined}><span>Assignments</span></Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === exams || pathname.startsWith(`${exams}/`)} className="text-sidebar-foreground/75">
                            <Link href={exams} onClick={closeMobile} aria-current={pathname === exams ? "page" : undefined}><span>Exams</span></Link>
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
        {STUDENT_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild tooltip={item.label} className="text-sidebar-foreground/75"
                      isActive={studentPath === item.href || (item.href !== "/learn" && studentPath.startsWith(`${item.href}/`))}>
                      <Link href={href(item.href)} onClick={closeMobile} aria-current={studentPath === item.href ? "page" : undefined}>
                        <HugeiconsIcon icon={studentIcons[item.href]} strokeWidth={1.5} aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter><PortalFooter portal="student" /></SidebarFooter>
    </Sidebar>
  );
}
