"use client";

import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useCanonicalHref, usePortalPath } from "../use-routing";

const TABS = [
  { label: "Details", href: "/app/manage/academy" },
  { label: "Structure", href: "/app/manage/academy/structure" },
  { label: "Enrollment", href: "/app/manage/academy/enrollment" },
] as const;

/** The General page's sections. Each tab is a link to its own page, so back, refresh and shared links work. */
export function GeneralTabs() {
  const pathname = usePortalPath("staff");
  const href = useCanonicalHref();
  const current = TABS.find((tab) => tab.href === pathname)?.href ?? TABS[0].href;
  // Manual activation: arrow keys only move focus, and Enter follows the focused link.
  return (
    <Tabs value={current} activationMode="manual" className="border-b">
      <TabsList variant="line" aria-label="General sections" className="max-w-full justify-start overflow-x-auto">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild className="flex-none">
            <Link href={href(tab.href)}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
