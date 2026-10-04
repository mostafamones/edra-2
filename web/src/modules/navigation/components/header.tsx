"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBreadcrumbOverride } from "@/components/shared/breadcrumb-title";

import { findStaffItem, findStudentItem, parentHref } from "../manifest";

export function PortalHeader({ portal }: { portal: "staff" | "student" }) {
  const pathname = usePathname();
  const override = useBreadcrumbOverride();
  const homeHref = portal === "staff" ? "/app" : "/learn";
  const homeLabel = portal === "staff" ? "Overview" : "Home";
  const item = portal === "staff" ? findStaffItem(pathname) : findStudentItem(pathname);
  const parent = portal === "staff" ? parentHref(pathname) : undefined;
  const parentItem = parent && parent !== homeHref ? findStaffItem(parent) : undefined;
  const inManagement = portal === "staff" && pathname.startsWith("/app/manage/");
  const managementItem = inManagement ? findStaffItem("/app/manage") : undefined;
  const title = override ?? item?.label ?? (portal === "staff" && pathname === "/app/students/import" ? "Review Import" : portal === "staff" && pathname === "/app/students/imports" ? "Import logs" : portal === "staff" && /^\/app\/schedules\/[^/]+\/edit$/.test(pathname) ? "Edit schedule" : homeLabel);

  return (
    <header className="sticky top-0 z-20 flex h-[var(--header-height,4rem)] shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className={portal === "student" ? "hidden md:inline-flex" : undefined} />
      <Separator
        orientation="vertical"
        className={`h-6 rounded-full mr-2 ${portal === "student" ? "hidden md:block" : ""}`}
        style={{ alignSelf: "center" }}
      />
      <Breadcrumb>
        <BreadcrumbList>
          {pathname !== homeHref ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={homeHref}>{homeLabel}</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          {managementItem ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={managementItem.href}>{managementItem.label}</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          {parentItem && parentItem.href !== managementItem?.href ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={parentItem.href}>{parentItem.label}</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          <BreadcrumbItem><BreadcrumbPage className="font-semibold">{title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
