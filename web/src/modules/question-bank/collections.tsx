import type { ComponentProps, ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { QueryContent } from "@/components/shared/query-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BankCollection, BankCollections } from "./bank-contract";
import { CollectionDialog } from "./collection-dialog";
import { collectionLabel, type BankScope } from "./queries";

function IconAction({ label, icon, ...props }: ComponentProps<typeof Button> & { label: string; icon: typeof Add01Icon }) {
  return <Tooltip>
    <TooltipTrigger asChild><Button {...props} type="button" size="icon-xs" variant="ghost" aria-label={label}>
      <HugeiconsIcon icon={icon} strokeWidth={1.5} />
    </Button></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

function Item({ label, count, active, nested, onClick, action }: {
  label: string; count: number; active: boolean; nested?: boolean; onClick: () => void; action?: ReactNode;
}) {
  return <li className={cn("group flex items-center gap-1 rounded-md", active && "bg-secondary", nested && "ms-4")}>
    <Button variant="ghost" aria-current={active ? "true" : undefined} onClick={onClick}
      className="h-auto min-h-8 min-w-0 flex-1 justify-between gap-2 py-1.5 font-normal whitespace-normal hover:bg-transparent">
      <span dir="auto" className="min-w-0 break-words text-start">{label}</span>
      <Badge variant="outline" className="shrink-0">{count}</Badge>
    </Button>
    {action}
  </li>;
}

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="space-y-1">
    <div className="flex min-h-7 items-center justify-between px-2"><h2 className="text-xs font-medium text-muted-foreground">{title}</h2>{action}</div>
    <ul className="space-y-0.5">{children}</ul>
  </section>;
}

/** All questions, then the four collection types; sections sit beneath their source document. */
export function CollectionBrowser({ scope, query, activeId, onChoose }: {
  scope: BankScope;
  query: UseQueryResult<BankCollections, Error>;
  activeId: string | null;
  onChoose: (collection: BankCollection | null) => void;
}) {
  return <QueryContent query={query} label="collections" isEmpty={() => false} emptyTitle="">
    {({ total, collections }) => {
      const of = (kind: BankCollection["kind"]) => collections.filter(collection => collection.kind === kind);
      const editable = (kind: "topic" | "custom") => of(kind).map(collection => <Item key={collection.id} label={collection.name} count={collection.count}
        active={collection.id === activeId} onClick={() => onChoose(collection)}
        action={<CollectionDialog scope={scope} target={{ kind, collection }} trigger={<IconAction label={`Rename ${collection.name}`} icon={PencilEdit01Icon} />} />} />);
      return <nav aria-label="Collections" className="space-y-4">
        <ul><Item label="All questions" count={total} active={!activeId} onClick={() => onChoose(null)} /></ul>
        <Group title="Topics" action={<CollectionDialog scope={scope} target={{ kind: "topic" }} trigger={<IconAction label="New topic" icon={Add01Icon} />} />}>
          {editable("topic")}
        </Group>
        {of("source_document").length > 0 && <Group title="Source documents">
          {of("source_document").map(document => {
            const sections = collections.filter(collection => collection.parentId === document.id);
            return [<Item key={document.id} label={document.name} count={document.count} active={document.id === activeId} onClick={() => onChoose(document)} />,
              ...sections.map(section => <Item key={section.id} nested label={collectionLabel(section)} count={section.count}
                active={section.id === activeId} onClick={() => onChoose(section)} />)];
          })}
        </Group>}
        <Group title="Collections" action={<CollectionDialog scope={scope} target={{ kind: "custom" }} trigger={<IconAction label="New collection" icon={Add01Icon} />} />}>
          {editable("custom")}
        </Group>
      </nav>;
    }}
  </QueryContent>;
}
