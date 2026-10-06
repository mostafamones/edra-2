"use client";
import { useCanonicalHref } from "../use-routing";

import Link from "next/link";

import { useAuth } from "@/modules/auth";

import { canViewStaffItem, type NavItem, type PagePreview } from "../manifest";
import { PagePreviewView } from "./preview";

export function StaffPreview({ item, preview }: { item: NavItem; preview: PagePreview }) {
  const href = useCanonicalHref();
  const { activeAcademy } = useAuth();

  if (!activeAcademy) return null;
  if (!canViewStaffItem(item, activeAcademy.role)) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Section unavailable</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This section is not available to your role in {activeAcademy.name}.
        </p>
        <Link href={href("/app")} className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline">Back to Overview</Link>
      </section>
    );
  }

  return <PagePreviewView preview={preview} />;
}
