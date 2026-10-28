"use client";
import { usePortalPath, useCanonicalHref } from "../use-routing";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

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
import { useBreadcrumbOverride, useBreadcrumbParent } from "@/components/shared/breadcrumb-title";
import { HEADER_ACTIONS_ID } from "@/components/shared/header-actions";

import { findStaffItem, findStudentItem, parentHref } from "../manifest";
import { studentBreadcrumbs } from "../student-breadcrumbs";

export function PortalHeader({ portal, academies = [] }: { portal: "staff" | "student"; academies?: { slug: string; name: string }[] }) {
  const href = useCanonicalHref();
  const pathname = usePortalPath(portal);
  const override = useBreadcrumbOverride();
  const overrideParent = useBreadcrumbParent();
  const publicPath = usePathname();
  const homeHref = portal === "staff" ? "/app" : "/learn";
  const homeLabel = "Home";
  const item = portal === "staff" ? findStaffItem(pathname) : findStudentItem(pathname);
  const parent = portal === "staff" ? parentHref(pathname) : undefined;
  const inManagement = portal === "staff" && pathname.startsWith("/app/manage/");
  const parentItem = parent && parent !== homeHref && !inManagement ? findStaffItem(parent) : undefined;
  const title = override ?? item?.label ?? (portal === "staff" && pathname === "/app/students/import" ? "Review Import" : portal === "staff" && pathname === "/app/students/imports" ? "Import logs" : portal === "staff" && /^\/app\/schedules\/[^/]+\/edit$/.test(pathname) ? "Edit schedule" : homeLabel);
  const studentCrumbs = portal === "student" ? studentBreadcrumbs(publicPath, academies) : [];
  if (studentCrumbs.length && override) studentCrumbs[studentCrumbs.length - 1].label = override;
  if (studentCrumbs.length > 2 && overrideParent) studentCrumbs[studentCrumbs.length - 2] = overrideParent;

  return (
    <header className="sticky top-0 z-20 flex h-[var(--header-height,4rem)] shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className={portal === "student" ? "hidden md:inline-flex" : undefined} />
      <Separator
        orientation="vertical"
        className={`h-6 rounded-full mr-2 ${portal === "student" ? "hidden md:block" : ""}`}
        style={{ alignSelf: "center" }}
      />
      <Breadcrumb className="min-w-0 font-heading">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          {portal === "student" ? studentCrumbs.map((crumb, index) => (
            <Fragment key={`${index}-${crumb.label}`}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">{crumb.href ? <BreadcrumbLink asChild><Link className="truncate" href={crumb.href}>{crumb.label}</Link></BreadcrumbLink> : <BreadcrumbPage className="truncate font-semibold">{crumb.label}</BreadcrumbPage>}</BreadcrumbItem>
            </Fragment>
          )) : <>
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
          </>}
        </BreadcrumbList>
      </Breadcrumb>
      <div id={HEADER_ACTIONS_ID} className="ml-auto flex items-center gap-2" />
    </header>
  );
}
