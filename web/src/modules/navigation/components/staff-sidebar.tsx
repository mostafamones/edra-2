"use client";
import { usePortalPath, useCanonicalHref } from "../use-routing";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft02Icon, AssignmentsIcon, Building03Icon, Calendar03Icon, FolderLibraryIcon, Home07Icon, Message01Icon, StudentsIcon, TeachingIcon, Task01Icon, Ticket01Icon, UserCircleIcon, UserGroupIcon } from "@hugeicons/core-free-icons";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
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
  STAFF_MANAGEMENT_NAV,
  ASSESSMENT_PATHS,
  STAFF_WORKSPACE_SECTIONS,
  type ManagementEntry,
  type NavItem,
  type StaffRole,
} from "../manifest";
import { AcademySwitcher } from "./academy-switcher";
import { useSectionOpenState } from "./open-state";
import { QuickCreate } from "./quick-create";
import { PortalFooter } from "./portal-footer";
import { useManagementReturn } from "../use-management-return";

function pageFor(href: string): NavItem {
  const item = findStaffItem(href);
  if (!item) throw new Error(`Missing staff navigation page: ${href}`);
  return item;
}

function activeFor(pathname: string, href: string) {
  return pathname === href || (href !== "/app" && href !== "/app/manage" && pathname.startsWith(`${href}/`));
}

type WorkspaceIcon = ComponentProps<typeof HugeiconsIcon>["icon"];

function StaffLink({ item, icon, pathname, closeMobile, also = [] }: {
  item: NavItem;
  icon?: WorkspaceIcon;
  pathname: string;
  closeMobile: () => void;
  /** Other pages that keep this entry active. */
  also?: readonly string[];
}) {
  const href = useCanonicalHref();
  const Icon = NAV_ICONS[item.icon];
  const active = [item.href, ...also].some((target) => activeFor(pathname, target));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label} isActive={active} className={icon ? "text-sidebar-foreground/75" : undefined}>
        <Link href={href(item.href)} onClick={closeMobile} aria-current={pathname === item.href ? "page" : undefined}>
          {icon ? <HugeiconsIcon icon={icon} strokeWidth={1.5} aria-hidden="true" /> : <Icon aria-hidden="true" />}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const workspaceIcons: Record<string, WorkspaceIcon> = {
  Teaching: TeachingIcon,
};

function WorkspaceSection({ label, icon, items, pathname, closeMobile, sidebarOpen, expandSidebar, savedOpen, onToggle }: {
  label: string;
  icon: WorkspaceIcon;
  items: NavItem[];
  pathname: string;
  closeMobile: () => void;
  sidebarOpen: boolean;
  expandSidebar: () => void;
  savedOpen: boolean | undefined;
  onToggle: (open: boolean) => void;
}) {
  const href = useCanonicalHref();
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
          <SidebarMenuButton tooltip={label} isActive={active} aria-label={`Toggle ${label} pages`} className="text-sidebar-foreground/75">
            <HugeiconsIcon icon={icon} strokeWidth={1.5} aria-hidden="true" />
            <span>{label}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" aria-hidden="true" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton asChild isActive={activeFor(pathname, item.href)} className="text-sidebar-foreground/75">
                  <Link href={href(item.href)} onClick={closeMobile} aria-current={pathname === item.href ? "page" : undefined}>
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
          <SidebarMenu>
            <StaffLink item={pageFor("/app")} icon={Home07Icon} pathname={pathname} closeMobile={closeMobile} />
            <StaffLink item={pageFor("/app/calendar")} icon={Calendar03Icon} pathname={pathname} closeMobile={closeMobile} />
            <StaffLink item={pageFor("/app/students")} icon={StudentsIcon} pathname={pathname} closeMobile={closeMobile} />
            {STAFF_WORKSPACE_SECTIONS.map((section) => {
              const items = section.hrefs.map(pageFor).filter((item) => canViewStaffItem(item, role));
              if (!items.length) return null;
              return (
                <WorkspaceSection
                  key={section.label}
                  label={section.label}
                  icon={workspaceIcons[section.label]}
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
            <StaffLink item={pageFor("/app/content")} icon={FolderLibraryIcon} pathname={pathname} closeMobile={closeMobile} />
            <StaffLink item={pageFor("/app/assessments")} icon={AssignmentsIcon} pathname={pathname} closeMobile={closeMobile} also={ASSESSMENT_PATHS} />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

const managementIcons: Record<string, WorkspaceIcon> = {
  "/app/manage/academy": Building03Icon,
  "/app/manage/team": UserGroupIcon,
  "/app/manage/bookings": Task01Icon,
  "/app/manage/access": Ticket01Icon,
  "/app/manage/messages": Message01Icon,
  "/app/manage/account": UserCircleIcon,
};

/** An entry matches by its own label or by the pages it covers, so "Structure" finds General. */
function matchesQuery(entry: ManagementEntry, query: string) {
  const labels = [entry.label, ...(entry.also ?? []).map((href) => findStaffItem(href)?.label ?? "")];
  return labels.some((label) => label.toLowerCase().includes(query));
}

function ManagementNavigation({ pathname, role, closeMobile, query }: { pathname: string; role: StaffRole | null; closeMobile: () => void; query: string }) {
  const href = useCanonicalHref();
  const needle = query.trim().toLowerCase();
  const visible = STAFF_MANAGEMENT_NAV.flatMap((group) => group.items).filter((entry) => canViewStaffItem(pageFor(entry.href), role) && matchesQuery(entry, needle));
  if (needle && visible.length === 0) return <p role="status" className="px-3 py-6 text-center text-sm text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden">No results</p>;
  return (
    <>
      {STAFF_MANAGEMENT_NAV.map((group) => {
        const entries = group.items.filter((entry) => visible.includes(entry));
        if (!entries.length) return null;
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {entries.map((entry) => {
                  const active = [entry.href, ...(entry.also ?? [])].some((target) => activeFor(pathname, target));
                  return (
                    <SidebarMenuItem key={entry.href}>
                      <SidebarMenuButton asChild tooltip={entry.label} isActive={active} className="text-sidebar-foreground/75">
                        <Link href={href(entry.href)} onClick={closeMobile} aria-current={active ? "page" : undefined}>
                          <HugeiconsIcon icon={managementIcons[entry.href]} strokeWidth={1.5} aria-hidden="true" />
                          <span>{entry.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

/** Management footer: sits where the workspace footer's Manage button is, so the two read as replacing each other. */
function BackFooter({ closeMobile, returnTo }: { closeMobile: () => void; returnTo: () => string }) {
  const router = useRouter();
  return (
    <div className="flex rounded-lg px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <Button variant="ghost" className="h-9 w-full justify-start gap-1 px-2 text-sidebar-foreground/75 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label="Back" onClick={() => { closeMobile(); router.push(returnTo()); }}>
        <HugeiconsIcon icon={ArrowLeft02Icon} size={20} strokeWidth={1.5} aria-hidden="true" />
        <span className="group-data-[collapsible=icon]:hidden">Back</span>
      </Button>
    </div>
  );
}

export function StaffSidebar() {
  const pathname = usePortalPath("staff");
  const { activeAcademy } = useAuth();
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar();
  const role = activeAcademy?.role ?? null;
  const management = pathname === "/app/manage" || pathname.startsWith("/app/manage/");
  const returnTo = useManagementReturn(activeAcademy?.slug, pathname, management);
  const closeMobile = () => setOpenMobile(false);
  const expandSidebar = () => { if (!open) setOpen(true); };

  return (
    <Sidebar collapsible="icon" variant="inset" className="group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]">
      <SidebarHeader>
        <AcademySwitcher />
        {management && <div className="mt-2 flex px-1 group-data-[collapsible=icon]:hidden"><SearchMenu platform="staff" /></div>}
        {!management && (
          <div className="flex items-center gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0 mt-2">
            <SearchMenu platform="staff" className="group-data-[collapsible=icon]:hidden" />
            <QuickCreate />
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className={open || isMobile ? "px-1" : ""}>
        {management ? (
          <ManagementNavigation pathname={pathname} role={role} closeMobile={closeMobile} query="" />
        ) : (
          <WorkspaceNavigation pathname={pathname} role={role} closeMobile={closeMobile} sidebarOpen={open || isMobile} expandSidebar={expandSidebar} />
        )}
      </SidebarContent>
      <SidebarFooter>{management ? <BackFooter closeMobile={closeMobile} returnTo={returnTo} /> : <PortalFooter />}</SidebarFooter>
    </Sidebar>
  );
}
