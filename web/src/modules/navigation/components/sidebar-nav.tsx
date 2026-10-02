"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { canViewStaffItem, NAV_ICONS, type NavGroup, type NavItem, type StaffRole } from "../manifest";

function activeFor(pathname: string, href: string) {
  return pathname === href || (href !== "/app" && href !== "/learn" && pathname.startsWith(`${href}/`));
}

export function SidebarNavigation({
  groups,
  role,
  staff = false,
}: {
  groups: readonly NavGroup[];
  role?: StaffRole | null;
  staff?: boolean;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const visible = (item: NavItem) => !staff || canViewStaffItem(item, role ?? null);
  const closeMobile = () => setOpenMobile(false);

  return (
    <>
      {groups.map((group) => {
        const items = group.items.filter(visible);
        if (!items.length) return null;
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  const children = item.children?.filter(visible) ?? [];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild tooltip={item.label} isActive={activeFor(pathname, item.href)}>
                        <Link href={item.href} onClick={closeMobile} aria-current={pathname === item.href ? "page" : undefined}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {children.length ? (
                        <SidebarMenuSub>
                          {children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton asChild isActive={pathname === child.href}>
                                <Link href={child.href} onClick={closeMobile} aria-current={pathname === child.href ? "page" : undefined}>
                                  <span>{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
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
