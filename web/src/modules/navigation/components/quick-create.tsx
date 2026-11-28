import { useCanonicalHref } from "../use-routing";

import Link from "@/components/shared/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AssignmentsIcon, Calendar03Icon, CheckListIcon, File01Icon, StudentsIcon, TeachingIcon } from "@hugeicons/core-free-icons";
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
  quizzes: CheckListIcon,
  exams: File01Icon,
};

/** `labeled` shows the full "Quick Create" button while the sidebar is expanded (Home, where search moves to the header). */
export function QuickCreate({ labeled = false }: { labeled?: boolean }) {
  const href = useCanonicalHref();
  const { activeAcademy } = useAuth();
  const { setOpenMobile, state } = useSidebar();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            {labeled ? <Button type="button" size="sm" className="flex-1 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" /><span className="group-data-[collapsible=icon]:sr-only">Quick Create</span>
            </Button> : <Button type="button" size="icon-sm" aria-label="Quick Create">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" />
            </Button>}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {(!labeled || state === "collapsed") && <TooltipContent side="right" sideOffset={8}>Quick Create</TooltipContent>}
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
