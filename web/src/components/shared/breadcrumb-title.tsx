"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type Parent = { label: string; href: string };
const Context = createContext<{ title: string | null; parent: Parent | null; publish: (title: string, path: string, parent?: Parent) => () => void }>({ title: null, parent: null, publish: () => () => {} });

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [entry, setEntry] = useState<{ title: string; path: string; parent?: Parent } | null>(null);
  const publish = useCallback((title: string, path: string, parent?: Parent) => {
    const next = { title, path, parent };
    setEntry(next);
    return () => setEntry((current) => current === next ? null : current);
  }, []);
  return <Context.Provider value={{ title: entry?.path === path ? entry.title : null, parent: entry?.path === path ? entry.parent ?? null : null, publish }}>{children}</Context.Provider>;
}

export const useBreadcrumbOverride = () => useContext(Context).title;
export const useBreadcrumbParent = () => useContext(Context).parent;

export function useBreadcrumbTitle(title: string, parent?: Parent) {
  const { publish } = useContext(Context);
  const path = usePathname();
  useEffect(() => publish(title, path, parent?.href && parent?.label ? { href: parent.href, label: parent.label } : undefined), [title, path, publish, parent?.href, parent?.label]);
}

export function BreadcrumbTitle({ title }: { title: string }) {
  useBreadcrumbTitle(title);
  return null;
}
