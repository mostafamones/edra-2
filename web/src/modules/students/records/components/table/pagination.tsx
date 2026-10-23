"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowLeftDoubleIcon, ArrowRight01Icon, ArrowRightDoubleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES, type PageSize } from "../../list-params";

type Props = {
  pageIndex: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
  disabled?: boolean;
};

const number = new Intl.NumberFormat("en");

/** Result range, total, page count, page navigation, and rows per page. */
export function StudentsPagination({ pageIndex, pageSize, total, onPageChange, onPageSizeChange, disabled }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);
  const atStart = pageIndex <= 0;
  const atEnd = pageIndex >= pageCount - 1;

  return (
    <nav aria-label="Student pages" className="-mt-1 flex flex-col-reverse gap-3 px-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? "No students" : <>Showing <span className="tabular-nums text-foreground">{number.format(first)}–{number.format(last)}</span> of <span className="tabular-nums text-foreground">{number.format(total)}</span></>}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="students-page-size" className="text-muted-foreground">Rows per page</label>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)} disabled={disabled}>
            <SelectTrigger id="students-page-size" size="sm" className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums text-muted-foreground">Page {number.format(pageIndex + 1)} of {number.format(pageCount)}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(0)} disabled={disabled || atStart} aria-label="First page"><HugeiconsIcon icon={ArrowLeftDoubleIcon} /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(pageIndex - 1)} disabled={disabled || atStart} aria-label="Previous page"><HugeiconsIcon icon={ArrowLeft01Icon} /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(pageIndex + 1)} disabled={disabled || atEnd} aria-label="Next page"><HugeiconsIcon icon={ArrowRight01Icon} /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => onPageChange(pageCount - 1)} disabled={disabled || atEnd} aria-label="Last page"><HugeiconsIcon icon={ArrowRightDoubleIcon} /></Button>
        </div>
      </div>
    </nav>
  );
}
