import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { MathText } from "@/components/shared/math-text";
import { QueryContent } from "@/components/shared/query-content";
import { Badge } from "@/components/ui/badge";
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
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border" aria-label="Questions">
        {data.rows.flatMap((row, index) => {
          const source = [row.file, row.page && `p. ${row.page}`].filter(Boolean).join(" · ");
          const previous = data.rows[index - 1];
          // Rows arrive in source order; a header marks each new file page so printed numbers read against it.
          const header = (!previous || previous.file !== row.file || previous.page !== row.page) && source
            ? [<li key={`${row.id}:source`} className="bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground first:rounded-t-xl" dir="auto">{source}</li>] : [];
          return [...header, <li key={row.id} className={cn("flex items-start gap-3 px-4 transition-colors last:rounded-b-xl hover:bg-muted/50", row.id === activeId && "bg-muted/70")}>
          {onSelect && <Checkbox className="mt-4.5" checked={selected?.has(row.id) ?? false} aria-label={`Select question ${row.printedNumber ?? ""}`.trim()}
            onCheckedChange={checked => onSelect(row.id, checked === true)} />}
          {/* A plain button: the row carries the hover, so the control adds none of its own. */}
          <button type="button" aria-current={row.id === activeId ? "true" : undefined} onClick={() => onOpen(row)}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-md py-3.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {row.printedNumber && <span className="mt-0.5 min-w-9 shrink-0 text-sm font-medium text-muted-foreground tabular-nums" dir="auto">Q{row.printedNumber}</span>}
            <span className="min-w-0 flex-1 space-y-1.5">
              <MathText value={row.prompt} className="line-clamp-2 text-sm leading-6 text-foreground" />
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="shrink-0 font-normal">{row.choice ? "Multiple choice" : "Written"}</Badge>
                {row.unitId && <span className="truncate">Linked unit</span>}
              </span>
            </span>
          </button>
        </li>];
        })}
      </ul>
      {(browse.previous || browse.next) && <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" disabled={!browse.previous} onClick={browse.previous}>Previous</Button>
        <span role="status" className="text-xs text-muted-foreground">{browse.range}</span>
        <Button variant="outline" size="sm" disabled={!browse.next} onClick={browse.next}>Next</Button>
      </div>}
    </div>}
  </QueryContent>;
}
