"use client";

import { useRef } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { BellIcon, Logout01Icon, Settings01Icon } from "@hugeicons/core-free-icons";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { useAccountProfile } from "@/modules/account";
import { useAuth } from "@/modules/auth";
import { DeveloperModeButton } from "@/modules/development";

import { useCanonicalHref } from "../use-routing";

/** Portal footer; the collapsed sidebar keeps just the account trigger. */
export function PortalFooter({ portal = "staff" }: { portal?: "staff" | "student" }) {
  const href = useCanonicalHref();
  const { setOpenMobile } = useSidebar();

  return (
    <div className="flex items-center gap-0 rounded-lg px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      {portal === "staff" && <Button asChild variant="ghost" size="icon" className="text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden" aria-label="Manage">
        <Link href={href("/app/manage")} onClick={() => setOpenMobile(false)}>
          <HugeiconsIcon icon={Settings01Icon} size={20} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </Button>}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden">
            <HugeiconsIcon icon={BellIcon} size={20} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={12} aria-label="Notifications" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0">
          <PopoverTitle className="border-b px-4 py-3">Notifications</PopoverTitle>
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet</p>
        </PopoverContent>
      </Popover>
      <DeveloperModeButton className="group-data-[collapsible=icon]:hidden" />
      <div className="flex-1 group-data-[collapsible=icon]:hidden" />
      <ProfileMenu portal={portal} />
    </div>
  );
}

function ProfileMenu({ portal }: { portal: "staff" | "student" }) {
  const href = useCanonicalHref();
  const { user } = useAuth();
  const { setOpenMobile } = useSidebar();
  const account = useAccountProfile();
  const signOutForm = useRef<HTMLFormElement>(null);
  const name = account.name ?? "Your account";
  const contact = user?.phone || user?.email || "";
  const initials = account.name?.slice(0, 1).toUpperCase() ?? "E";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Account menu" className="rounded-full">
          <Avatar className="size-8">
            <AvatarImage src={account.avatarUrl} alt="" />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={12}
        className="w-60 max-w-[calc(100vw-2rem)] **:data-[variant=destructive]:text-destructive! **:data-[variant=destructive]:**:text-destructive!">
        <DropdownMenuLabel className="flex items-center gap-3 p-2 font-normal">
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={account.avatarUrl} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-[13px]">{name}</p>
            {contact && <p className="truncate text-xs text-muted-foreground">{contact}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={href(portal === "staff" ? "/app/manage/account" : "/learn/profile")} onClick={() => setOpenMobile(false)} className="gap-2 py-2">
            <HugeiconsIcon icon={Settings01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />
            Account Settings
          </Link>
        </DropdownMenuItem>
        <form ref={signOutForm} action="/auth/signout" method="post">
          <DropdownMenuItem variant="destructive" className="gap-2 py-2" onSelect={(event) => {
            event.preventDefault();
            signOutForm.current?.requestSubmit();
          }}>
            <HugeiconsIcon icon={Logout01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
