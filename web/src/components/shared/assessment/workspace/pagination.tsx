"use client";

import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

type Props = { pageIndex: number; pageSize: number; total: number; onPageChange: (pageIndex: number) => void };

/** Result range, page count, and page navigation for the student results table. */
export function StudentsPagination({ pageIndex, pageSize, total, onPageChange }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);
  const atStart = pageIndex <= 0;
  const atEnd = pageIndex >= pageCount - 1;

  return (
    <nav aria-label="Student pages" className="flex flex-col-reverse gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        Showing <span className="tabular-nums text-foreground">{first}–{last}</span> of <span className="tabular-nums text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-4">
        <span className="tabular-nums text-muted-foreground">Page {pageIndex + 1} of {pageCount}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(0)} disabled={atStart} aria-label="First page"><IconChevronsLeft /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(pageIndex - 1)} disabled={atStart} aria-label="Previous page"><IconChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(pageIndex + 1)} disabled={atEnd} aria-label="Next page"><IconChevronRight /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(pageCount - 1)} disabled={atEnd} aria-label="Last page"><IconChevronsRight /></Button>
        </div>
      </div>
    </nav>
  );
}
