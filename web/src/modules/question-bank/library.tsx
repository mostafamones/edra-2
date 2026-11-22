import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, FileUploadIcon, FolderRemoveIcon } from "@hugeicons/core-free-icons";
import { HeaderActions } from "@/components/shared/header-actions";
import Link from "@/components/shared/link";
import { QueryContent } from "@/components/shared/query-content";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { staffAcademyHref } from "@/lib/routing";
import { cn } from "@/lib/utils";
import type { BankCollection, BankSummary } from "./bank-contract";
import { useBankBrowse } from "./browse";
import { CollectionBrowser } from "./collections";
import { AddToCollection, useMembership } from "./membership";
import { QuestionPreview } from "./preview";
import { BankSearch, NoQuestion, QuestionList } from "./question-list";
import { bankDetailOptions, collectionLabel, collectionsOptions, type BankScope } from "./queries";

type View = "collections" | "list" | "detail";

/** Saved-question library: collection browser, compact list and selected-question preview. */
export function QuestionLibraryPage({ scope }: { scope: BankScope }) {
  const importHref = staffAcademyHref(scope.academySlug, "/question-bank/import");
  const collections = useQuery(collectionsOptions(scope));
  const browse = useBankBrowse(scope);
  const [active, setActive] = useState<BankSummary>();
  const [view, setView] = useState<View>("list");
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
    setView("list");
  }

  async function remove(collection: BankCollection, ids: string[]) {
    setNotice("");
    const message = await update(collection.id, ids, false);
    if (message === null) return;
    if (message) { setNotice(message); return; }
    setSelected(previous => new Set([...previous].filter(id => !ids.includes(id))));
  }

  const pane = (name: View) => cn("min-h-0 min-w-0 flex-col", view === name ? "flex" : "hidden lg:flex");
  return <main className="page-shell flex flex-col gap-4">
    <HeaderActions>
      <Button asChild size="sm"><Link href={importHref}><HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.5} />Import PDF</Link></Button>
    </HeaderActions>
    <h1 className="font-heading text-2xl font-semibold">Question bank</h1>
    {notice && <Alert variant="destructive"><AlertTitle>{notice}</AlertTitle></Alert>}
    <div className="grid min-w-0 gap-4 lg:h-[clamp(28rem,calc(100svh-12rem),56rem)] lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className={cn(pane("collections"), "overflow-y-auto overscroll-contain")}><CollectionBrowser scope={scope} query={collections} activeId={browse.collectionId} onChoose={choose} /></div>

      <section aria-label="Questions" className={cn(pane("list"), "gap-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="lg:hidden" size="sm" variant="ghost" onClick={() => setView("collections")}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />Collections
          </Button>
          <h2 className="me-auto min-w-0 truncate text-base font-semibold" dir="auto">{current ? collectionLabel(current) : "All questions"}</h2>
          {browse.page.data && <span className="text-xs text-muted-foreground">{browse.total}</span>}
        </div>
        <BankSearch browse={browse} id="qb-library-search" />
        {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5" role="group" aria-label="Selected questions">
          <span role="status" className="me-auto px-1 text-sm">{selected.size} selected</span>
          <AddToCollection scope={scope} collections={list} questionIds={[...selected]} onDone={() => setSelected(new Set())} />
          {removable && <Button size="sm" variant="outline" onClick={() => void remove(removable, [...selected])}>
            <HugeiconsIcon icon={FolderRemoveIcon} strokeWidth={1.5} />Remove from {removable.kind === "topic" ? "topic" : "collection"}
          </Button>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>}
        <QuestionList browse={browse} activeId={active?.id} selected={selected}
          onSelect={(id, on) => setSelected(previous => { const next = new Set(previous); if (on && next.size < 100) next.add(id); else next.delete(id); return next; })}
          onOpen={row => { setActive(row); setView("detail"); }}
          emptyAction={<Button asChild size="sm"><Link href={importHref}>Import PDF</Link></Button>} />
      </section>

      <section aria-label="Question preview" className={cn(pane("detail"), "gap-3 lg:overflow-y-auto lg:overscroll-contain lg:rounded-xl lg:border lg:p-4")}>
        <Button className="self-start lg:hidden" size="sm" variant="ghost" onClick={() => setView("list")}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />Back to questions
        </Button>
        {!active ? <NoQuestion title="Select a question" /> :
          <QueryContent query={detail} label="question" isEmpty={() => false} emptyTitle="">
            {data => <QuestionPreview detail={data} collections={list} academySlug={scope.academySlug}
              onRemove={collection => void remove(collection, [data.id])}
              actions={<AddToCollection scope={scope} collections={list} questionIds={[data.id]} />} />}
          </QueryContent>}
      </section>
    </div>
  </main>;
}
