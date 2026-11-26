import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, FileUploadIcon, FolderLibraryIcon, FolderRemoveIcon } from "@hugeicons/core-free-icons";
import { HeaderActions } from "@/components/shared/header-actions";
import Link from "@/components/shared/link";
import { QueryContent } from "@/components/shared/query-content";
import { ActionBar, ActionBarSeparator } from "@/components/ui/action-bar";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FloatingSheet, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { staffAcademyHref } from "@/lib/routing";
import type { BankCollection, BankSummary } from "./bank-contract";
import { useBankBrowse } from "./browse";
import { CollectionBrowser } from "./collections";
import { AddToCollection, useMembership } from "./membership";
import { QuestionPreview } from "./preview";
import { BankSearch, QuestionList } from "./question-list";
import { bankDetailOptions, collectionLabel, collectionsOptions, type BankScope } from "./queries";

/** Saved-question library: collection sidebar, full-width question list, and a side preview opened per question. */
export function QuestionLibraryPage({ scope }: { scope: BankScope }) {
  const importHref = staffAcademyHref(scope.academySlug, "/question-bank/import");
  const collections = useQuery(collectionsOptions(scope));
  const browse = useBankBrowse(scope);
  const [active, setActive] = useState<BankSummary>();
  const [browsing, setBrowsing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const update = useMembership(scope);
  const detail = useQuery({ ...bankDetailOptions(scope, active?.id ?? ""), enabled: !!active });
  const list = collections.data?.collections ?? [];
  const current = list.find(collection => collection.id === browse.collectionId);
  const removable = current && (current.kind === "topic" || current.kind === "custom") ? current : undefined;

  function choose(collection: BankCollection | null) {
    browse.setCollection(collection?.id ?? null);
    setSelected(new Set());
    setBrowsing(false);
  }

  async function remove(collection: BankCollection, ids: string[]) {
    setNotice("");
    const message = await update(collection.id, ids, false);
    if (message === null) return;
    if (message) { setNotice(message); return; }
    setSelected(previous => new Set([...previous].filter(id => !ids.includes(id))));
  }

  const browser = <CollectionBrowser scope={scope} query={collections} activeId={browse.collectionId} onChoose={choose} />;
  return <main className="page-shell">
    <HeaderActions>
      <Button asChild size="sm"><Link href={importHref}><HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.5} />Import PDF</Link></Button>
    </HeaderActions>
    {notice && <Alert variant="destructive"><AlertTitle>{notice}</AlertTitle></Alert>}
    <div className="grid min-w-0 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden lg:sticky lg:top-(--header-height,4rem) lg:block lg:max-h-[calc(100svh-var(--header-height,4rem)-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
        {browser}
      </aside>

      <section aria-label="Questions" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button className="lg:hidden" size="sm" variant="outline" onClick={() => setBrowsing(true)}>
            <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.5} />Collections
          </Button>
          <h1 className="min-w-0 truncate text-lg font-semibold" dir="auto">{current ? collectionLabel(current) : "All questions"}</h1>
          {browse.page.data && <span className="text-sm text-muted-foreground tabular-nums">{browse.total}</span>}
          <div className="w-full sm:ms-auto sm:w-72"><BankSearch browse={browse} id="qb-library-search" /></div>
        </div>
        <QuestionList browse={browse} activeId={active?.id} selected={selected}
          onSelect={(id, on) => setSelected(previous => { const next = new Set(previous); if (on && next.size < 100) next.add(id); else next.delete(id); return next; })}
          onOpen={setActive}
          emptyAction={<Button asChild size="sm"><Link href={importHref}>Import PDF</Link></Button>} />
      </section>
    </div>

    <Sheet open={browsing} onOpenChange={setBrowsing}>
      <SheetContent side="left" className="gap-0">
        <SheetHeader className="border-b"><SheetTitle>Collections</SheetTitle></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{browser}</div>
      </SheetContent>
    </Sheet>

    {/* Non-modal so the list stays usable: clicking another row swaps the preview instead of closing it. */}
    <FloatingSheet modal={false} open={!!active} onOpenChange={open => { if (!open) setActive(undefined); }}>
      <FloatingSheetContent className="gap-0 sm:w-lg"
        onInteractOutside={event => { if ((event.target as Element | null)?.closest?.("[data-bank-rows]")) event.preventDefault(); }}>
        <FloatingSheetHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <FloatingSheetTitle dir="auto">{active?.printedNumber ? `Question ${active.printedNumber}` : "Question"}</FloatingSheetTitle>
        </FloatingSheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {active && <QueryContent query={detail} label="question" isEmpty={() => false} emptyTitle="">
            {data => <QuestionPreview detail={data} collections={list} academySlug={scope.academySlug}
              onRemove={collection => void remove(collection, [data.id])}
              actions={<AddToCollection scope={scope} collections={list} questionIds={[data.id]} />} />}
          </QueryContent>}
        </div>
      </FloatingSheetContent>
    </FloatingSheet>

    {selected.size > 0 && <ActionBar aria-label="Selected questions">
      <span role="status" className="px-2 font-medium tabular-nums">{selected.size} selected</span>
      <ActionBarSeparator />
      <AddToCollection scope={scope} collections={list} questionIds={[...selected]} onDone={() => setSelected(new Set())} />
      {removable && <Button size="sm" variant="ghost" onClick={() => void remove(removable, [...selected])}>
        <HugeiconsIcon icon={FolderRemoveIcon} strokeWidth={1.5} />Remove from {removable.kind === "topic" ? "topic" : "collection"}
      </Button>}
      <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />
      </Button>
    </ActionBar>}
  </main>;
}
