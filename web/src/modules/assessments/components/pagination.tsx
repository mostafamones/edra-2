"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES, type AssessmentListParams, type PageSize } from "../params";

type Props = {
  params: AssessmentListParams;
  total: number;
  disabled: boolean;
  onChange: (change: Partial<AssessmentListParams>) => void;
};

export function AssessmentPagination({ params, total, disabled, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / params.pageSize));
  const first = total === 0 ? 0 : params.page * params.pageSize + 1;
  const last = Math.min(total, (params.page + 1) * params.pageSize);
  return (
    <nav aria-label="Assessment pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="tabular-nums text-muted-foreground" aria-live="polite">Showing {first}–{last} of {total}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="assessments-page-size" className="text-muted-foreground">Per page</label>
          <Select value={String(params.pageSize)} disabled={disabled} onValueChange={(value) => onChange({ pageSize: Number(value) as PageSize })}>
            <SelectTrigger id="assessments-page-size" size="sm" className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <span className="tabular-nums text-muted-foreground">Page {params.page + 1} of {pages}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={disabled || params.page === 0}
            onClick={() => onChange({ page: params.page - 1 })}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={disabled || params.page >= pages - 1}
            onClick={() => onChange({ page: params.page + 1 })}><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} /></Button>
        </div>
      </div>
    </nav>
  );
}
