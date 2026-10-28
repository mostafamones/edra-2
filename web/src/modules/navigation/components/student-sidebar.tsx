"use client";
import { useCanonicalHref, usePortalPath } from "../use-routing";

import Link from "next/link";
import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { AssignmentsIcon, Book02Icon, Building03Icon, Calendar03Icon, ChartBarLineIcon, Compass01Icon, Home07Icon, Mortarboard01Icon, Note01Icon, Task01Icon, TeachingIcon } from "@hugeicons/core-free-icons";

import { SearchMenu } from "../search/menu";

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
  useSidebar,
} from "@/components/ui/sidebar";

import { studentAcademyPath } from "@/lib/routing";

import { STUDENT_GROUPS } from "../manifest";
import { PortalFooter } from "./portal-footer";

const studentIcons: Record<string, ComponentProps<typeof HugeiconsIcon>["icon"]> = {
  "/learn": Home07Icon,
  "/learn/calendar": Calendar03Icon,
  "/learn/discover": Compass01Icon,
  "/learn/courses": Book02Icon,
  "/learn/assignments": AssignmentsIcon,
  "/learn/quizzes": Task01Icon,
  "/learn/exams": Note01Icon,
  "/learn/results": ChartBarLineIcon,
  "/learn/attendance": TeachingIcon,
};

/** Academies the student is connected to; each links to its academy home. */
export type StudentSidebarAcademy = { name: string; slug: string };

export function StudentSidebar({ academies = [] }: { academies?: StudentSidebarAcademy[] }) {
  const href = useCanonicalHref();
  const pathname = usePathname();
  const studentPath = usePortalPath("student");
  const { open, isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);
  const isActive = (item: string) => studentPath === item || (item !== "/learn" && studentPath.startsWith(`${item}/`));
  return (
    <Sidebar collapsible="icon" variant="inset" className="group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]">
      <SidebarHeader>
        <SidebarMenu className="-mx-1 w-auto group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:py-2">
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="font-heading">
              <Link href={href("/learn")} onClick={closeMobile}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <HugeiconsIcon icon={Mortarboard01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />
                </span>
                <span className="truncate text-base font-medium">Edra Learning</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-2 flex px-1 group-data-[collapsible=icon]:hidden">
          <SearchMenu platform="student" academies={academies} />
        </div>
      </SidebarHeader>
      <SidebarContent className={open || isMobile ? "px-1" : ""}>
        {STUDENT_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild tooltip={item.label} className="text-sidebar-foreground/75" isActive={isActive(item.href)}>
                      <Link href={href(item.href)} onClick={closeMobile} aria-current={isActive(item.href) ? "page" : undefined}>
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
        {academies.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Academies</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {academies.map((academy) => {
                  const path = studentAcademyPath(academy.slug);
                  const active = pathname === path || pathname === `/learn/academy/${academy.slug}`;
                  return (
                    <SidebarMenuItem key={academy.slug}>
                      <SidebarMenuButton asChild tooltip={academy.name} className="text-sidebar-foreground/75" isActive={active}>
                        <Link href={path} onClick={closeMobile} aria-current={active ? "page" : undefined}>
                          <HugeiconsIcon icon={Building03Icon} strokeWidth={1.5} aria-hidden="true" />
                          <span>{academy.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter><PortalFooter portal="student" /></SidebarFooter>
    </Sidebar>
  );
}
