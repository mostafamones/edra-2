"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useAuth } from "@/modules/auth";

import {
  canViewStaffItem,
  findStaffItem,
  NAV_ICONS,
  STAFF_MANAGEMENT_GROUPS,
  STAFF_WORKSPACE_SECTIONS,
  type NavIcon,
  type NavItem,
  type StaffRole,
} from "../manifest";
import { AcademySwitcher } from "./academy-switcher";
import { AccountMenu } from "./account-menu";
import { useSectionOpenState } from "./open-state";
import { QuickCreate } from "./quick-create";

function pageFor(href: string): NavItem {
  const item = findStaffItem(href);
  if (!item) throw new Error(`Missing staff navigation page: ${href}`);
  return item;
}

function activeFor(pathname: string, href: string) {
  return pathname === href || (href !== "/app" && href !== "/app/manage" && pathname.startsWith(`${href}/`));
}

function StaffLink({ item, pathname, closeMobile }: { item: NavItem; pathname: string; closeMobile: () => void }) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label} isActive={activeFor(pathname, item.href)}>
        <Link href={item.href} onClick={closeMobile} aria-current={pathname === item.href ? "page" : undefined}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function WorkspaceSection({ label, icon, items, pathname, closeMobile, sidebarOpen, expandSidebar, savedOpen, onToggle }: {
  label: string;
  icon: NavIcon;
  items: NavItem[];
  pathname: string;
  closeMobile: () => void;
  sidebarOpen: boolean;
  expandSidebar: () => void;
  savedOpen: boolean | undefined;
  onToggle: (open: boolean) => void;
}) {
  const Icon = NAV_ICONS[icon];
  const active = items.some((item) => activeFor(pathname, item.href));
  return (
    <Collapsible
      asChild
      open={savedOpen ?? active}
      onOpenChange={(nextOpen) => {
        if (!sidebarOpen) {
          expandSidebar();
          onToggle(true);
        } else {
          onToggle(nextOpen);
        }
      }}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} isActive={active} aria-label={`Toggle ${label} pages`}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" aria-hidden="true" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton asChild isActive={activeFor(pathname, item.href)}>
                  <Link href={item.href} onClick={closeMobile} aria-current={pathname === item.href ? "page" : undefined}>
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function WorkspaceNavigation({ pathname, role, closeMobile, sidebarOpen, expandSidebar }: {
  pathname: string;
  role: StaffRole | null;
  closeMobile: () => void;
  sidebarOpen: boolean;
  expandSidebar: () => void;
}) {
  const [savedOpen, setSavedOpen] = useSectionOpenState();
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <QuickCreate />
          <SidebarMenu>
            <StaffLink item={pageFor("/app")} pathname={pathname} closeMobile={closeMobile} />
            <StaffLink item={pageFor("/app/calendar")} pathname={pathname} closeMobile={closeMobile} />
            {STAFF_WORKSPACE_SECTIONS.map((section) => {
              const items = section.hrefs.map(pageFor).filter((item) => canViewStaffItem(item, role));
              if (!items.length) return null;
              return (
                <WorkspaceSection
                  key={section.label}
                  label={section.label}
                  icon={section.icon}
                  items={items}
                  pathname={pathname}
                  closeMobile={closeMobile}
                  sidebarOpen={sidebarOpen}
                  expandSidebar={expandSidebar}
                  savedOpen={savedOpen[section.label]}
                  onToggle={(open) => setSavedOpen(section.label, open)}
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="mt-auto">
        <SidebarGroupContent>
          <SidebarMenu>
            <StaffLink item={pageFor("/app/manage")} pathname={pathname} closeMobile={closeMobile} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function ManagementNavigation({ pathname, role, closeMobile }: { pathname: string; role: StaffRole | null; closeMobile: () => void }) {
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to workspace">
                <Link href="/app" onClick={closeMobile}>
                  <ArrowLeft aria-hidden="true" />
                  <span>Back to workspace</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <StaffLink item={pageFor("/app/manage")} pathname={pathname} closeMobile={closeMobile} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {STAFF_MANAGEMENT_GROUPS.map((group) => {
        const items = group.hrefs.map(pageFor).filter((item) => canViewStaffItem(item, role));
        if (!items.length) return null;
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => <StaffLink key={item.href} item={item} pathname={pathname} closeMobile={closeMobile} />)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

export function StaffSidebar() {
  const pathname = usePathname();
  const { activeAcademy } = useAuth();
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar();
  const role = activeAcademy?.role ?? null;
  const management = pathname === "/app/manage" || pathname.startsWith("/app/manage/");
  const closeMobile = () => setOpenMobile(false);
  const expandSidebar = () => { if (!open) setOpen(true); };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader><AcademySwitcher /></SidebarHeader>
      <SidebarContent className={open ? "px-1" : ""}>
        {management ? (
          <ManagementNavigation pathname={pathname} role={role} closeMobile={closeMobile} />
        ) : (
          <WorkspaceNavigation pathname={pathname} role={role} closeMobile={closeMobile} sidebarOpen={open || isMobile} expandSidebar={expandSidebar} />
        )}
      </SidebarContent>
      <SidebarFooter><AccountMenu portal="staff" /></SidebarFooter>
    </Sidebar>
  );
}
