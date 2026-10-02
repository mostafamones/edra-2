"use client";

import Link from "next/link";
import { Bell, LogOut, MoreVertical, UserRound } from "lucide-react";

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
import { useAuth } from "@/modules/auth";

export function AccountMenu({ portal }: { portal: "staff" | "student" }) {
  const { user, activeAcademy } = useAuth();
  const { isMobile } = useSidebar();
  const name = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "Your account";
  const contact = user?.phone || user?.email || "";
  const avatar = typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : undefined;
  const initials = name === "Your account" ? "E" : name.trim().slice(0, 1).toUpperCase();

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
              <MoreVertical className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" className="min-w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{contact || name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={portal === "staff" ? "/app/manage/account" : "/learn/profile"} className="gap-2 py-2">
                <UserRound className="size-4" />Account
              </Link>
            </DropdownMenuItem>
            {portal === "staff" && activeAcademy?.role !== "instructor" ? (
              <DropdownMenuItem asChild>
                <Link href="/app/manage/notifications" className="gap-2 py-2">
                  <Bell className="size-4" />Notifications
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem asChild variant="destructive">
                <button type="submit" className="w-full gap-2 py-2 text-left">
                  <LogOut className="size-4" />Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
