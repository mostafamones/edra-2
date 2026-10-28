import Link from "next/link";
import type { ReactNode } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

import { studentListPath } from "@/lib/routing";
import { listMyStudentAcademies } from "@/modules/students/server";

import type { AcademyItems, Scope } from "../data";
import { AcademyFilter } from "./academy-filter";
import { Pager } from "./pager";

/**
 * A cross-academy page: one section per academy that has something to show, or one empty state.
 * `pick` narrows an academy's items. Unscoped pages link to each academy's filtered list; scoped pages page through it.
 */
export async function AcademySections<T>({ title, section, empty, groups, scope, query, filter, pick = (items) => items, children }: {
  title: string;
  /** The list's path, such as "assignments", for links to one academy's full list. */
  section: string;
  scope: Scope;
  /** Query values the pager keeps, such as an active filter. */
  query?: Record<string, string>;
  /** Shown under the title while a filter applies. */
  filter?: ReactNode;
  empty: string;
  groups: AcademyItems<T>[];
  pick?: (items: T[]) => T[];
  children: (item: T, slug: string) => ReactNode;
}) {
  const academies = await listMyStudentAcademies();
  const sections = groups.map((group) => ({ ...group, items: group.items && pick(group.items) }))
    .filter((group) => group.items === null || group.items.length > 0);
  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <AcademyFilter academies={academies} value={scope?.slug} />
      </div>
      {filter}
      {sections.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-16"><EmptyHeader><EmptyTitle>{empty}</EmptyTitle></EmptyHeader></Empty>
      ) : sections.map(({ academy, items, hasMore }) => (
        <section key={academy.id} aria-labelledby={`academy-${academy.id}`} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id={`academy-${academy.id}`} className="font-heading text-lg font-medium">{academy.name}</h2>
            {!scope && hasMore && <Button variant="ghost" size="sm" asChild><Link href={studentListPath(section, academy.slug)}>View all</Link></Button>}
          </div>
          {items === null
            ? <Alert><AlertTitle>This academy could not be loaded.</AlertTitle></Alert>
            : <ul className="flex flex-col gap-2">{items.map((item) => children(item, academy.slug))}</ul>}
        </section>
      ))}
      {scope && <Pager page={scope.page} hasMore={groups.some((group) => group.hasMore)} query={{ ...query, academy: scope.slug }} />}
    </main>
  );
}

/** One linked row; the whole card is the link target. */
export function ItemRow({ href, title, meta, badge }: { href: string; title: string; meta?: ReactNode; badge?: ReactNode }) {
  return (
    <li className="relative flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={href} className="truncate font-medium outline-none after:absolute after:inset-0">{title}</Link>
        {meta && <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">{meta}</div>}
      </div>
      {badge}
    </li>
  );
}
