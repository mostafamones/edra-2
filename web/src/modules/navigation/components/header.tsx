"use client";
import { usePortalPath, useCanonicalHref } from "../use-routing";

import Link from "next/link";

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
  const href = useCanonicalHref();
  const pathname = usePortalPath(portal);
  const override = useBreadcrumbOverride();
  const homeHref = portal === "staff" ? "/app" : "/learn";
  const homeLabel = "Home";
  const item = portal === "staff" ? findStaffItem(pathname) : findStudentItem(pathname);
  const parent = portal === "staff" ? parentHref(pathname) : undefined;
  const inManagement = portal === "staff" && pathname.startsWith("/app/manage/");
  const parentItem = parent && parent !== homeHref && !inManagement ? findStaffItem(parent) : undefined;
  const studentPage = portal === "student" ? /^\/learn\/(?:academy\/)?[^/]+\/exams(\/[^/]+)?$/.exec(pathname) : null;
  const title = override ?? item?.label ?? (studentPage ? (studentPage[1] ? "Exam" : "Exams") : portal === "staff" && pathname === "/app/students/import" ? "Review Import" : portal === "staff" && pathname === "/app/students/imports" ? "Import logs" : portal === "staff" && /^\/app\/schedules\/[^/]+\/edit$/.test(pathname) ? "Edit schedule" : homeLabel);

  return (
    <header className="sticky top-0 z-20 flex h-[var(--header-height,4rem)] shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className={portal === "student" ? "hidden md:inline-flex" : undefined} />
      <Separator
        orientation="vertical"
        className={`h-6 rounded-full mr-2 ${portal === "student" ? "hidden md:block" : ""}`}
        style={{ alignSelf: "center" }}
      />
      <Breadcrumb className="font-(family-name:--font-poppins)">
        <BreadcrumbList>
          {pathname !== homeHref ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={href(homeHref)}>{homeLabel}</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          {parentItem ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={href(parentItem.href)}>{parentItem.label}</Link></BreadcrumbLink>
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
