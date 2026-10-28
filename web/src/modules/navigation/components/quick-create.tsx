"use client";
import { useCanonicalHref } from "../use-routing";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AssignmentsIcon, Calendar03Icon, StudentsIcon, TeachingIcon } from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/modules/auth";

import { canViewStaffItem, STAFF_CREATE_ITEMS } from "../manifest";

const icons: Record<string, ComponentProps<typeof HugeiconsIcon>["icon"]> = {
  students: StudentsIcon,
  sessions: TeachingIcon,
  schedules: Calendar03Icon,
  assignments: AssignmentsIcon,
};

export function QuickCreate() {
  const href = useCanonicalHref();
  const { activeAcademy } = useAuth();
  const { setOpenMobile } = useSidebar();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon-sm" aria-label="Quick Create">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>Quick Create</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="bottom" className="min-w-48">
        {STAFF_CREATE_ITEMS.filter((item) => canViewStaffItem(item, activeAcademy?.role ?? null)).map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={href(item.href)} onClick={() => setOpenMobile(false)} className="gap-2 py-2">
              <HugeiconsIcon icon={icons[item.icon]} className="size-4" strokeWidth={1.5} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
