import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Previous and next links for a scoped list, keeping its other query values; hidden on a single page. */
export function Pager({ page, hasMore, query = {} }: { page: number; hasMore: boolean; query?: Record<string, string> }) {
  if (page <= 1 && !hasMore) return null;
  const link = (target: number, label: string, enabled: boolean) => enabled
    ? <Button variant="outline" size="sm" asChild><Link href={`?${new URLSearchParams({ ...query, ...(target > 1 && { page: String(target) }) })}`}>{label}</Link></Button>
    : <Button variant="outline" size="sm" disabled>{label}</Button>;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm">
      {link(page - 1, "Previous", page > 1)}
      <span className="text-muted-foreground">Page {page}</span>
      {link(page + 1, "Next", hasMore)}
    </nav>
  );
}
