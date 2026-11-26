import { Fragment, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowDown01Icon, Image01Icon, Link04Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { MathText } from "@/components/shared/math-text";
import { QueryContent } from "@/components/shared/query-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BankCollection, BankSummary } from "./bank-contract";
import type { useBankBrowse } from "./browse";
import { fileTitle, questionNumber } from "./queries";

type Browse = ReturnType<typeof useBankBrowse>;

export function BankSearch({ browse, id }: { browse: Browse; id: string }) {
  return <InputGroup>
    <InputGroupAddon><HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} /></InputGroupAddon>
    <InputGroupInput id={id} type="search" aria-label="Search questions" placeholder="Search questions" dir="auto"
      maxLength={200} value={browse.text} onChange={event => browse.setText(event.target.value)} />
  </InputGroup>;
}

function Indicator({ icon, label }: { icon: typeof AlertCircleIcon; label: string }) {
  return <Tooltip>
    <TooltipTrigger asChild><span role="img" aria-label={label} className="flex size-6 items-center justify-center text-muted-foreground">
      <HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-4" />
    </span></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

type Group = { key: string; title: string; rows: BankSummary[] };

/** Rows arrive in source order, so consecutive rows from one file page form a group. */
function groupRows(rows: BankSummary[]) {
  const groups: Group[] = [];
  for (const row of rows) {
    const key = `${row.file ?? ""}|${row.page ?? ""}`;
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, title: [row.file && fileTitle(row.file), row.page && `Page ${row.page}`].filter(Boolean).join(" · ") || "No source", rows: [row] });
  }
  return groups;
}

/** Paginated question rows grouped by source page, with loading, empty, no-match and failure states kept apart. */
export function QuestionList({ browse, activeId, onOpen, selected, onSelect, emptyAction, collections, menu }: {
  browse: Browse;
  activeId?: string;
  onOpen: (row: BankSummary) => void;
  selected?: Set<string>;
  onSelect?: (id: string, on: boolean) => void;
  emptyAction?: ReactNode;
  /** Shows each row's topics and collections by name. */
  collections?: BankCollection[];
  /** Context-menu items for a row. */
  menu?: (row: BankSummary) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const names = new Map(collections?.map(collection => [collection.id, collection.name]));
  const toggle = (key: string, open: boolean) => setCollapsed(previous => {
    const next = new Set(previous);
    if (open) next.delete(key); else next.add(key);
    return next;
  });

  const row = (item: BankSummary) => {
    const number = questionNumber(item.printedNumber);
    const chips = item.collections.map(id => names.get(id)).filter(name => !!name);
    const content = <li className={cn("flex items-center gap-3 px-4 transition-colors hover:bg-muted/50", item.id === activeId && "bg-muted/70")}>
      {onSelect && <Checkbox checked={selected?.has(item.id) ?? false}
        aria-label={`Select ${number ? `question ${number}` : "question"}`} onCheckedChange={checked => onSelect(item.id, checked === true)} />}
      {/* A plain button: the row carries the hover, so the control adds none of its own. */}
      <button type="button" aria-current={item.id === activeId ? "true" : undefined} onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="w-7 shrink-0 text-sm text-muted-foreground tabular-nums">{number}</span>
        <span className="min-w-0 flex-1 space-y-1.5">
          <MathText value={item.prompt} className="line-clamp-2 text-sm leading-6 text-foreground" />
          {chips.length > 0 && <span className="flex flex-wrap gap-1">
            {chips.slice(0, 3).map(name => <Badge key={name} variant="secondary" className="max-w-48 font-normal"><span dir="auto" className="truncate">{name}</span></Badge>)}
            {chips.length > 3 && <Badge variant="outline" className="font-normal">+{chips.length - 3}</Badge>}
          </span>}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-0.5">
        {!item.answered && <Indicator icon={AlertCircleIcon} label={item.choice ? "No answer confirmed" : "No model answer"} />}
        {item.figures && <Indicator icon={Image01Icon} label="Has figures" />}
        {item.unitId && <Indicator icon={Link04Icon} label="Linked to a Library unit" />}
      </span>
    </li>;
    return menu ? <ContextMenu key={item.id}>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">{menu(item)}</ContextMenuContent>
    </ContextMenu> : <Fragment key={item.id}>{content}</Fragment>;
  };

  return <QueryContent query={browse.page} label="questions" isEmpty={data => !data.rows.length}
    emptyTitle={browse.filtered ? "No matching questions" : browse.archived ? "No archived questions" : "No saved questions"}
    emptyAction={browse.filtered ? <Button variant="outline" size="sm" onClick={browse.clear}>Clear filters</Button> : browse.archived ? undefined : emptyAction}>
    {data => <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        <ul aria-label="Questions" className="divide-y">
          {groupRows(data.rows).map(group => {
            const open = !collapsed.has(group.key);
            return <Collapsible key={group.key} asChild open={open} onOpenChange={next => toggle(group.key, next)}>
              <li>
                <CollapsibleTrigger className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2 text-start text-sm font-medium outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                  <span dir="auto" className="min-w-0 flex-1 truncate">{group.title}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{group.rows.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent asChild>
                  <ul className="divide-y border-t" aria-label={group.title}>{group.rows.map(row)}</ul>
                </CollapsibleContent>
              </li>
            </Collapsible>;
          })}
        </ul>
      </div>
      {(browse.previous || browse.next) && <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" disabled={!browse.previous} onClick={browse.previous}>Previous</Button>
        <span role="status" className="text-xs text-muted-foreground">{browse.range}</span>
        <Button variant="outline" size="sm" disabled={!browse.next} onClick={browse.next}>Next</Button>
      </div>}
    </div>}
  </QueryContent>;
}
