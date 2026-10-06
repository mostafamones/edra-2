"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onboardingHref } from "@/lib/routing";
import { academySwitchHref } from "../switch-destination";
import type { AcademyEntry } from "@/modules/academies";
import { IconBook as BookOpen, IconCheck as Check, IconSelector as ChevronsUpDown, IconCode as Code2, IconWorld as Globe2, IconSchool as GraduationCap, IconMicroscope as Microscope, IconMusic as Music2, IconPalette as Palette, IconPlus as Plus, IconBuildingCommunity as School, IconTrophy as Trophy, type Icon as TablerIcon } from "@tabler/icons-react";

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

const academyIcons: Record<string, TablerIcon> = {
  school: School,
  book: BookOpen,
  graduate: GraduationCap,
  science: Microscope,
  code: Code2,
  art: Palette,
  music: Music2,
  trophy: Trophy,
  world: Globe2,
};

function AcademyIcon({ icon }: { icon: string | undefined }) {
  const Icon = academyIcons[icon ?? ""] ?? School;
  return <Icon className="size-4" aria-hidden="true" />;
}

export function AcademySwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { academies, academiesLoading, academiesError, activeAcademy, setActiveAcademy } = useAuth();
  const { isMobile } = useSidebar();
  const [open, setOpen] = useState(false);

  function switchAcademy(academy: AcademyEntry) {
    const destination = academySwitchHref(pathname, activeAcademy?.slug, academy);
    setActiveAcademy(academy);
    setOpen(false);
    router.push(destination);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (!/^[1-9]$/.test(event.key)) return;
      const academy = academies[Number(event.key) - 1];
      if (!academy) return;
      event.preventDefault();
      const destination = academySwitchHref(pathname, activeAcademy?.slug, academy);
      setActiveAcademy(academy);
      setOpen(false);
      router.push(destination);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, academies, setActiveAcademy, pathname, activeAcademy?.slug, router]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" aria-label={activeAcademy ? `Switch academy, current: ${activeAcademy.name}` : "Switch academy"}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <AcademyIcon icon={activeAcademy?.icon} />
              </span>
              <span className="grid min-w-0 flex-1 text-left text-base">
                <span className="truncate font-medium">{activeAcademy?.name ?? (academiesLoading ? "Loading academies" : "No academy")}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="start" className="min-w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Your academies</DropdownMenuLabel>
            {academiesError ? (
              <p className="px-2 py-3 text-sm text-destructive">Could not load your academies.</p>
            ) : academies.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No academies yet.</p>
            ) : academies.map((academy, index) => (
              <DropdownMenuItem key={academy.id} onSelect={() => switchAcademy(academy)} className="gap-2 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border text-primary">
                  <AcademyIcon icon={academy.icon} />
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium">{academy.name}</span>
                  <span className="truncate text-xs capitalize text-muted-foreground">{academy.role}</span>
                </span>
                {activeAcademy?.id === academy.id ? (
                  <Check className="size-4" aria-label="Current academy" />
                ) : index < 9 ? (
                  <span className="text-xs text-muted-foreground">⌘{index + 1}</span>
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={onboardingHref("academy/create")} className="gap-2 py-2">
                <span className="flex size-8 items-center justify-center rounded-md border"><Plus className="size-4" /></span>
                <span>Create academy</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
