"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const Context = createContext<{ title: string | null; publish: (title: string, path: string) => () => void }>({ title: null, publish: () => () => {} });

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [entry, setEntry] = useState<{ title: string; path: string } | null>(null);
  const publish = useCallback((title: string, path: string) => {
    const next = { title, path };
    setEntry(next);
    return () => setEntry((current) => current === next ? null : current);
  }, []);
  return <Context.Provider value={{ title: entry?.path === path ? entry.title : null, publish }}>{children}</Context.Provider>;
}

export const useBreadcrumbOverride = () => useContext(Context).title;

export function useBreadcrumbTitle(title: string) {
  const { publish } = useContext(Context);
  const path = usePathname();
  useEffect(() => publish(title, path), [title, path, publish]);
}
