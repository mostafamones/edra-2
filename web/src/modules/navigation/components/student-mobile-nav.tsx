"use client";
import { usePortalPath, useCanonicalHref } from "../use-routing";

import Link from "next/link";
import { IconBook as BookOpen, IconCalendar as CalendarDays, IconSchool as GraduationCap, IconHome as House, IconMenu as Menu, IconUser as UserRound, IconClipboardCheck as ClipboardCheck, IconChartBar as BarChart3, IconFilePencil as FilePenLine, IconListCheck as ListChecks } from "@tabler/icons-react";
import { IconLogout } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function BottomLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof House; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-[10px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active && "text-primary",
    )}>
      <Icon className="size-5" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function StudentMobileNav() {
  const href = useCanonicalHref();
  const pathname = usePortalPath("student");
  const workActive = pathname === "/learn/assignments" || pathname === "/learn/quizzes";
  const moreActive = pathname === "/learn/attendance" || pathname === "/learn/results" || pathname === "/learn/profile";

  return (
    <nav aria-label="Student mobile navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
      <div className="flex h-14 items-stretch gap-1">
        <BottomLink href={href("/learn")} label="Home" icon={House} active={pathname === "/learn"} />
        <BottomLink href={href("/learn/calendar")} label="Calendar" icon={CalendarDays} active={pathname === "/learn/calendar"} />
        <BottomLink href={href("/learn/content")} label="Learning" icon={GraduationCap} active={pathname === "/learn/content"} />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" aria-label="Open assessments navigation" className={cn("flex h-auto min-w-0 flex-1 flex-col gap-1 px-1 py-1 text-[10px] font-medium text-muted-foreground", workActive && "text-primary")}>
              <BookOpen className="size-5" aria-hidden="true" /><span className="max-w-full truncate">Assessments</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl pb-8">
            <SheetHeader><SheetTitle>Assessments</SheetTitle></SheetHeader>
            <div className="flex flex-col gap-1 px-4">
              <SheetClose asChild><Link href={href("/learn/assignments")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><FilePenLine className="size-4" />Assignments</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/quizzes")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><ListChecks className="size-4" />Quizzes</Link></SheetClose>
            </div>
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" aria-label="Open more navigation" className={cn("flex h-auto min-w-0 flex-1 flex-col gap-1 px-1 py-1 text-[10px] font-medium text-muted-foreground", moreActive && "text-primary")}>
              <Menu className="size-5" aria-hidden="true" /><span>More</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl pb-8">
            <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
            <div className="flex flex-col gap-1 px-4">
              <SheetClose asChild><Link href={href("/learn/attendance")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><ClipboardCheck className="size-4" />Attendance</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/results")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><BarChart3 className="size-4" />Results</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/profile")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><UserRound className="size-4" />Profile</Link></SheetClose>
              <form action="/auth/signout" method="post"><button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-destructive hover:bg-accent"><IconLogout className="size-4" />Sign out</button></form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
