import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { MathText } from "@/components/shared/math-text";
import { QueryContent } from "@/components/shared/query-content";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { BankSummary } from "./bank-contract";
import type { useBankBrowse } from "./browse";

type Browse = ReturnType<typeof useBankBrowse>;

export function BankSearch({ browse, id }: { browse: Browse; id: string }) {
  return <InputGroup>
    <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} /></InputGroupAddon>
    <InputGroupInput id={id} type="search" aria-label="Search questions" placeholder="Search questions" dir="auto"
      maxLength={200} value={browse.text} onChange={event => browse.setText(event.target.value)} />
  </InputGroup>;
}

/** Compact, paginated question rows with loading, empty, no-match and failure states kept apart. */
export function QuestionList({ browse, activeId, onOpen, selected, onSelect, emptyAction }: {
  browse: Browse;
  activeId?: string;
  onOpen: (row: BankSummary) => void;
  selected?: Set<string>;
  onSelect?: (id: string, on: boolean) => void;
  emptyAction?: ReactNode;
}) {
  return <QueryContent query={browse.page} label="questions" isEmpty={data => !data.rows.length}
    emptyTitle={browse.filtered ? "No matching questions" : "No saved questions"}
    emptyAction={browse.filtered ? <Button variant="outline" size="sm" onClick={browse.clear}>Clear filters</Button> : emptyAction}>
    {data => <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ul data-bank-rows className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain rounded-xl border" aria-label="Questions">
        {data.rows.map(row => <li key={row.id} className={cn("flex items-start gap-3 px-3 transition-colors hover:bg-muted/50", row.id === activeId && "bg-muted hover:bg-muted")}>
          {onSelect && <Checkbox className="mt-4" checked={selected?.has(row.id) ?? false} aria-label={`Select question ${row.printedNumber ?? ""}`.trim()}
            onCheckedChange={checked => onSelect(row.id, checked === true)} />}
          <Button variant="ghost" aria-current={row.id === activeId ? "true" : undefined}
            className="h-auto min-h-14 min-w-0 flex-1 justify-start px-0 py-3 whitespace-normal hover:bg-transparent" onClick={() => onOpen(row)}>
            <span className="min-w-0 text-start font-normal">
              <MathText value={row.prompt} className="line-clamp-2 text-sm" />
              <span className="mt-1 block truncate text-xs text-muted-foreground" dir="auto">
                {[row.printedNumber && `Q${row.printedNumber}`, row.file, row.page && `p. ${row.page}`, row.choice ? "Choice" : "Written", row.unitId && "Linked unit"].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Button>
        </li>)}
      </ul>
      {(browse.previous || browse.next) && <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" disabled={!browse.previous} onClick={browse.previous}>Previous</Button>
        <span role="status" className="text-xs text-muted-foreground">{browse.range}</span>
        <Button variant="outline" size="sm" disabled={!browse.next} onClick={browse.next}>Next</Button>
      </div>}
    </div>}
  </QueryContent>;
}
