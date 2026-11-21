import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon, ArrowDown01Icon, AssignmentsIcon, Calendar03Icon, FolderLibraryIcon, Home07Icon, LibraryIcon, Search01Icon, StudentsIcon, TeachingIcon, UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { IconSchool } from "@/components/shared/icons";
import { SidebarIcon } from "@/components/shared/sidebar-icon";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider,
} from "@/components/ui/sidebar";
import { StudentsPreview } from "@/modules/students";
import { academy, studentsPage } from "./sample";

const WIDTH = 1136;

const items = [
  { label: "Home", icon: Home07Icon },
  { label: "Calendar", icon: Calendar03Icon },
  { label: "Students", icon: StudentsIcon, active: true },
  { label: "Teaching", icon: TeachingIcon, children: ["Schedules", "Attendance"] },
  { label: "Content", icon: FolderLibraryIcon },
  { label: "Assessments", icon: AssignmentsIcon },
  { label: "Question bank", icon: LibraryIcon },
];

/**
 * The staff workspace as a signed-in owner sees it on Students: the app's sidebar layout and its real
 * Students table over sample data. Display only, so the whole window is inert.
 */
export function SampleWorkspace() {
  // The sidebar provider binds Ctrl/⌘+B to toggling the app's saved sidebar state; keep that off this page.
  useEffect(() => {
    const stop = (event: KeyboardEvent) => { if (event.key === "b" && (event.metaKey || event.ctrlKey)) event.stopImmediatePropagation(); };
    window.addEventListener("keydown", stop, true);
    return () => window.removeEventListener("keydown", stop, true);
  }, []);

  // Laid out at desktop width and scaled to fit, so narrow screens see the real page in miniature.
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const scale = Math.min(1, outer.current.clientWidth / WIDTH);
      setFit({ scale, height: inner.current.offsetHeight * scale });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer.current!);
    observer.observe(inner.current!);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} inert className="select-none overflow-hidden" style={{ height: fit?.height }}>
      <div ref={inner} className="origin-top-left" style={{ width: WIDTH, transform: fit ? `scale(${fit.scale})` : undefined }}>
      <SidebarProvider className="min-h-0 bg-sidebar [--sidebar-width:15rem]">
        <Sidebar collapsible="none" className="h-auto border-r">
          <SidebarHeader>
            <SidebarMenuButton size="lg" className="font-heading">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><IconSchool className="size-4" aria-hidden="true" /></span>
              <span className="truncate text-base font-medium">{academy.name}</span>
              <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={1.5} className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
            <div className="mt-2 flex items-center gap-1 px-1">
              <Button variant="outline" size="sm" className="flex-1 justify-start gap-2 text-muted-foreground"><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" />Search<Kbd className="ml-auto">⌘K</Kbd></Button>
              <Button variant="outline" size="icon-sm" aria-label="Create"><HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} aria-hidden="true" /></Button>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-1">
            <SidebarGroup>
              <SidebarMenu>
                {items.map(item => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton isActive={item.active} className="text-sidebar-foreground/75 data-[active=true]:text-sidebar-accent-foreground">
                      <HugeiconsIcon icon={item.icon} strokeWidth={1.5} aria-hidden="true" /><span>{item.label}</span>
                      {item.children && <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="ml-auto" aria-hidden="true" />}
                    </SidebarMenuButton>
                    {item.children && <SidebarMenuSub>{item.children.map(child => (
                      <SidebarMenuSubItem key={child}><SidebarMenuSubButton className="text-sidebar-foreground/75">{child}</SidebarMenuSubButton></SidebarMenuSubItem>
                    ))}</SidebarMenuSub>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-2 rounded-lg p-2">
              <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">YS</span>
              <span className="grid text-left text-xs"><span className="font-medium">You</span><span className="text-muted-foreground">Owner</span></span>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="min-w-0 flex-1 overflow-hidden bg-background m-2 ml-0 rounded-xl shadow-sm">
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <Button variant="ghost" size="icon-sm" aria-label="Toggle Sidebar"><SidebarIcon side="left" open /></Button>
            <Separator orientation="vertical" className="mr-2 h-5 self-center!" />
            <Breadcrumb className="font-heading"><BreadcrumbList><BreadcrumbItem><BreadcrumbPage className="font-semibold">Students</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
          </header>
          <div className="page-shell p-4 sm:p-6">
            <StudentsPreview {...studentsPage} />
          </div>
        </div>
      </SidebarProvider>
      </div>
    </div>
  );
}
