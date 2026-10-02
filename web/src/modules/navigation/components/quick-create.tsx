"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useAuth } from "@/modules/auth";

import { canViewStaffItem, NAV_ICONS, STAFF_CREATE_ITEMS } from "../manifest";

export function QuickCreate() {
  const { activeAcademy } = useAuth();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton aria-label="Quick Create" tooltip="Quick Create" className="min-w-8 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground data-[state=open]:bg-primary/90 data-[state=open]:text-primary-foreground">
              <Plus className="size-4" aria-hidden="true" />
              <span>Quick Create</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="min-w-48">
            {STAFF_CREATE_ITEMS.filter((item) => canViewStaffItem(item, activeAcademy?.role ?? null)).map((item) => {
              const Icon = NAV_ICONS[item.icon];
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="gap-2 py-2">
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
