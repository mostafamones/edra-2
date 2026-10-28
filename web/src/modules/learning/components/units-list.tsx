"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { COURSE_ROWS, CourseCard } from "@/modules/content/student-cards";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { readMyUnits, Scope } from "../data";
import { Pager } from "./pager";
import { UNIT_STATUSES, unitStarted, unitStatus, type UnitStatus } from "../started";
import { ViewSettings } from "./view-settings";


// My courses lists every course the student holds a grant for, started or not; expired ones stay behind the status filter.
const HELD = ["active", "expired"];

export function UnitsList({ started, search: initialSearch, scope, initialView, initialStatuses, initialGroup, groups, now, academies }: {
  started: boolean; search: string; scope?: Scope; initialView: "grid" | "list"; initialStatuses: UnitStatus[]; initialGroup: "none" | "academy" | "status"; groups: Awaited<ReturnType<typeof readMyUnits>>; now: number; academies?: { slug: string; name: string }[];
}) {
  const [view, setView] = useState(initialView);
  const [search, setSearch] = useState(initialSearch);
  const router = useRouter();
  const pathname = usePathname();
  const picked = scope?.slug;
  const [statuses, setStatuses] = useState(initialStatuses);
  const [group, setGroup] = useState(initialGroup);
  const courses = groups.flatMap(({ academy, items }) => (items ?? []).filter((unit) => (started ? HELD.includes(unit.access.status) : !unitStarted(unit)) && statuses.includes(unitStatus(unit, now)) && unit.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((unit) => ({ unit, academy })))
    .sort((a, b) => {
      const aExpiry = a.unit.access.expiresAt;
      const bExpiry = b.unit.access.expiresAt;
      if (aExpiry && bExpiry) return Date.parse(aExpiry) - Date.parse(bExpiry) || b.unit.publishedAt.localeCompare(a.unit.publishedAt);
      if (aExpiry) return -1;
      if (bExpiry) return 1;
      return b.unit.publishedAt.localeCompare(a.unit.publishedAt);
    });
  const failed = groups.filter((group) => group.items === null);
  const more = groups.filter((group) => group.hasMore);
  const title = started ? "My courses" : "Discover";
  const layout = started ? view : "grid";
  // Settings survive the search, paging, and each other.
  const settings = { ...(layout === "list" && { view: "list" }), ...(picked && { academy: picked }), ...(group !== "none" && { group }), ...(!(statuses.length === 1 && statuses[0] === "active") && { status: statuses.join(",") || "none" }) };
  const query = { ...(search && { q: search }), ...settings };
  // Picking an academy reloads the list scoped to it, so its pages are complete.
  const pick = (academy: string | undefined) => {
    const next: Record<string, string> = { ...query, ...(academy && { academy }) };
    if (!academy) delete next.academy;
    router.push(Object.keys(next).length ? `${pathname}?${new URLSearchParams(next)}` : pathname);
  };
  const sections = group === "none" ? [{ title: "", items: courses }] : group === "status"
    ? UNIT_STATUSES.map((status) => ({ title: status[0].toUpperCase() + status.slice(1), items: courses.filter(({ unit }) => unitStatus(unit, now) === status) })).filter((section) => section.items.length)
    : Array.from(new Map(courses.map(({ academy }) => [academy.id, academy.name])).entries()).map(([id, name]) => ({ title: name, items: courses.filter(({ academy }) => academy.id === id) }));

  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex w-full gap-2 sm:w-auto">
          <ViewSettings layout={started ? layout : undefined} academies={academies} academy={picked} statuses={statuses} group={group} onLayoutChange={setView} onAcademyChange={pick} onStatusesChange={setStatuses} onGroupChange={setGroup} />
          <div className="min-w-0 flex-1 sm:w-80">
            <InputGroup>
              <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput name="q" type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} aria-label="Search courses" placeholder="Search" />
            </InputGroup>
          </div>
        </div>
      </div>
      {failed.length > 0 && <Alert><AlertTitle>Could not load {failed.map((group) => group.academy.name).join(", ")}.</AlertTitle></Alert>}
      {courses.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-16">
          <EmptyHeader><EmptyTitle>{search ? "No matching courses" : "No courses to show"}</EmptyTitle></EmptyHeader>
          {search && <Button variant="outline" onClick={() => setSearch("")}>Clear search</Button>}
        </Empty>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-3">
              {section.title && <h2 className="px-3 text-xs font-medium text-muted-foreground">{section.title}</h2>}
              <ul className={layout === "list" ? COURSE_ROWS : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}>
                {section.items.map(({ unit, academy }) => (
                  <li key={unit.id} className={layout === "list" ? "col-span-full grid grid-cols-subgrid" : undefined}><CourseCard unit={unit} slug={academy.slug} academyName={academy.name} now={now} layout={layout} /></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {scope && <Pager page={scope.page} hasMore={more.length > 0} query={query} />}
      {!scope && more.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {more.map(({ academy }) => <Button key={academy.id} variant="outline" size="sm" asChild><Link href={`?${new URLSearchParams({ ...query, academy: academy.slug })}`}>More in {academy.name}</Link></Button>)}
        </div>
      )}
    </main>
  );
}
