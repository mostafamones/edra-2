"use client";
import { useCanonicalHref } from "../use-routing";

import { useRef } from "react";
import Link from "next/link";
import { IconBell, IconDotsVertical, IconLogout, IconUser } from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { isAcademyManager } from "@/modules/academies";
import { useAccountProfile } from "@/modules/account";
import { useAuth } from "@/modules/auth";
import { DeveloperModeMenuItem } from "@/modules/development";

export function AccountMenu({ portal }: { portal: "staff" | "student" }) {
  const href = useCanonicalHref();
  const { user, activeAcademy } = useAuth();
  const { isMobile } = useSidebar();
  const signOutForm = useRef<HTMLFormElement>(null);
  const account = useAccountProfile();
  const name = account.name ?? "Your account";
  const contact = user?.phone || user?.email || "";
  const avatar = account.avatarUrl;
  const initials = account.name ? account.name.slice(0, 1).toUpperCase() : "E";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label="Account menu">
              <Avatar className="size-8">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{contact}</span>
              </span>
              <IconDotsVertical className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" className="min-w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{contact || name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={href(portal === "staff" ? "/app/manage/account" : "/learn/profile")} className="gap-2 py-2">
                <IconUser className="size-4" />Account
              </Link>
            </DropdownMenuItem>
            {portal === "staff" && activeAcademy && isAcademyManager(activeAcademy.role) ? (
              <DropdownMenuItem asChild>
                <Link href={href("/app/manage/notifications")} className="gap-2 py-2">
                  <IconBell className="size-4" />Notifications
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DeveloperModeMenuItem />
            <DropdownMenuSeparator />
            <form ref={signOutForm} action="/auth/signout" method="post">
              <DropdownMenuItem
                variant="destructive"
                className="gap-2 py-2"
                onSelect={(event) => {
                  // Keep the menu (and form) mounted until the browser has submitted.
                  event.preventDefault();
                  signOutForm.current?.requestSubmit();
                }}
              >
                <IconLogout className="size-4" />Sign out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
