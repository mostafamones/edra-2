"use client";
import { usePortalPath, useCanonicalHref } from "../use-routing";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { AssignmentsIcon, Book02Icon, Calendar03Icon, ChartBarLineIcon, CheckListIcon, Compass01Icon, Home07Icon, Logout01Icon, Menu01Icon, Note01Icon, Task01Icon, TeachingIcon, UserIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function BottomLink({ href, label, icon, active }: { href: string; label: string; icon: typeof Home07Icon; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-[10px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active && "text-primary",
    )}>
      <HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-5" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function StudentMobileNav() {
  const href = useCanonicalHref();
  const pathname = usePortalPath("student");
  const workActive = ["/learn/assignments", "/learn/quizzes", "/learn/exams"].includes(pathname);
  const moreActive = ["/learn/discover", "/learn/attendance", "/learn/results", "/learn/profile"].includes(pathname);

  return (
    <nav aria-label="Student mobile navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
      <div className="flex h-14 items-stretch gap-1">
        <BottomLink href={href("/learn")} label="Home" icon={Home07Icon} active={pathname === "/learn"} />
        <BottomLink href={href("/learn/calendar")} label="Calendar" icon={Calendar03Icon} active={pathname === "/learn/calendar"} />
        <BottomLink href={href("/learn/courses")} label="Courses" icon={Book02Icon} active={pathname === "/learn/courses"} />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" aria-label="Open my work navigation" className={cn("flex h-auto min-w-0 flex-1 flex-col gap-1 px-1 py-1 text-[10px] font-medium text-muted-foreground", workActive && "text-primary")}>
              <HugeiconsIcon icon={CheckListIcon} strokeWidth={1.5} className="size-5" aria-hidden="true" /><span className="max-w-full truncate">My work</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl pb-8">
            <SheetHeader><SheetTitle>My work</SheetTitle></SheetHeader>
            <div className="flex flex-col gap-1 px-4">
              <SheetClose asChild><Link href={href("/learn/assignments")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={AssignmentsIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Assignments</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/quizzes")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={Task01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Quizzes</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/exams")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={Note01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Exams</Link></SheetClose>
            </div>
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" aria-label="Open more navigation" className={cn("flex h-auto min-w-0 flex-1 flex-col gap-1 px-1 py-1 text-[10px] font-medium text-muted-foreground", moreActive && "text-primary")}>
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.5} className="size-5" aria-hidden="true" /><span>More</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl pb-8">
            <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
            <div className="flex flex-col gap-1 px-4">
              <SheetClose asChild><Link href={href("/learn/discover")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={Compass01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Discover</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/results")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={ChartBarLineIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Results</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/attendance")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={TeachingIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Attendance</Link></SheetClose>
              <SheetClose asChild><Link href={href("/learn/profile")} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"><HugeiconsIcon icon={UserIcon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Account</Link></SheetClose>
              <form action="/auth/signout" method="post"><button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-destructive hover:bg-accent"><HugeiconsIcon icon={Logout01Icon} strokeWidth={1.5} className="size-4" aria-hidden="true" />Sign out</button></form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
