import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive02Icon, ArchiveRestoreIcon, Cancel01Icon, Delete02Icon, FileUploadIcon, FolderAddIcon, FolderLibraryIcon, FolderRemoveIcon, PencilEdit01Icon, ViewIcon,
} from "@hugeicons/core-free-icons";
import { HeaderActions } from "@/components/shared/header-actions";
import Link from "@/components/shared/link";
import { QueryContent } from "@/components/shared/query-content";
import { ActionBar, ActionBarSeparator } from "@/components/ui/action-bar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { FloatingSheet, FloatingSheetContent, FloatingSheetFooter, FloatingSheetHeader, FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { staffAcademyHref } from "@/lib/routing";
import { useQuestionActions } from "./actions";
import type { BankCollection, BankDetail, BankSummary, QuestionEdit } from "./bank-contract";
import { useBankBrowse } from "./browse";
import { CollectionBrowser } from "./collections";
import { QuestionEditor } from "./editor";
import { AddToCollection, useMembership } from "./membership";
import { QuestionPreview } from "./preview";
import { BankSearch, QuestionList } from "./question-list";
import { bankDetailOptions, bankKeys, collectionLabel, collectionsOptions, fileTitle, questionTitle, type BankScope } from "./queries";

const plural = (count: number) => count === 1 ? "question" : `${count} questions`;
// Open a dialog only after the context menu has closed, so its dismissal cannot close the dialog.
const afterMenu = (open: () => void) => requestAnimationFrame(open);

/** Saved-question library: collection sidebar, source-ordered question list, and a preview/edit sheet per question. */
export function QuestionLibraryPage({ scope }: { scope: BankScope }) {
  const importHref = staffAcademyHref(scope.academySlug, "/question-bank/import");
  const collections = useQuery(collectionsOptions(scope));
  const browse = useBankBrowse(scope);
  const [active, setActive] = useState<BankSummary>();
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [pending, setPending] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const update = useMembership(scope);
  const actions = useQuestionActions(scope);
  const client = useQueryClient();
  const detail = useQuery({ ...bankDetailOptions(scope, active?.id ?? ""), enabled: !!active });
  const list = collections.data?.collections ?? [];
  const current = list.find(collection => collection.id === browse.collectionId);
  const removable = current && (current.kind === "topic" || current.kind === "custom") ? current : undefined;
  const heading = browse.archived ? "Archived" : current ? collectionLabel(current) : "All questions";

  function open(row: BankSummary | undefined) {
    setActive(row);
    setEditing(false);
    setEditError("");
  }

  function choose(collection: BankCollection | null) {
    browse.setCollection(collection?.id ?? null);
    setSelected(new Set());
    setBrowsing(false);
  }

  const forget = (ids: string[]) => {
    setSelected(previous => new Set([...previous].filter(id => !ids.includes(id))));
    if (active && ids.includes(active.id)) open(undefined);
  };

  async function remove(collection: BankCollection, ids: string[]) {
    const message = await update(collection.id, ids, false);
    if (message) toast.error(message);
    else if (message === undefined) setSelected(previous => new Set([...previous].filter(id => !ids.includes(id))));
  }

  async function archive(ids: string[], archived: boolean) {
    const message = await actions.archive(ids, archived);
    if (message === null) return;
    if (message) { toast.error(message); return; }
    forget(ids);
    toast.success(`${archived ? "Archived" : "Restored"} ${plural(ids.length)}`, {
      action: { label: "Undo", onClick: () => void actions.archive(ids, !archived) },
    });
  }

  async function destroy(ids: string[]) {
    setPending(true);
    const message = await actions.remove(ids);
    setPending(false);
    if (message === null) return;
    if (message) { toast.error(message); return; }
    setDeleting(null);
    forget(ids);
    toast.success(`Deleted ${plural(ids.length)}`);
  }

  async function save(question: BankDetail, changes: QuestionEdit) {
    if (pending) return;
    setPending(true); setEditError("");
    const message = await actions.update(question.id, changes);
    setPending(false);
    if (message === null) return;
    if (message) { setEditError(message); if (!editing) toast.error(message); return; }
    setEditing(false);
  }

  // Optimistic: the choice shows at once and rolls back if the save fails.
  async function answer(question: BankDetail, key: string | null) {
    const { prompt, choices, modelAnswer } = question.payload;
    const cacheKey = bankKeys.detail(scope, question.id);
    client.setQueryData(cacheKey, { ...question, payload: { ...question.payload, answer: key } });
    const message = await actions.update(question.id, { prompt, choices, answer: key, modelAnswer: modelAnswer ?? "" });
    if (message === undefined) return;
    client.setQueryData(cacheKey, question);
    if (message) toast.error(message);
  }

  const select = (id: string, on: boolean) => setSelected(previous => { const next = new Set(previous); if (on && next.size < 100) next.add(id); else next.delete(id); return next; });

  const menu = (row: BankSummary) => <>
    <ContextMenuItem onSelect={() => open(row)}><HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} />Open</ContextMenuItem>
    <ContextMenuItem onSelect={() => { open(row); setEditing(true); }}><HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit</ContextMenuItem>
    <ContextMenuItem onSelect={() => afterMenu(() => setAdding([row.id]))}><HugeiconsIcon icon={FolderAddIcon} strokeWidth={1.5} />Add to collection</ContextMenuItem>
    {removable && <ContextMenuItem onSelect={() => void remove(removable, [row.id])}>
      <HugeiconsIcon icon={FolderRemoveIcon} strokeWidth={1.5} />Remove from {removable.kind === "topic" ? "topic" : "collection"}
    </ContextMenuItem>}
    <ContextMenuSeparator />
    {browse.archived
      ? <ContextMenuItem onSelect={() => void archive([row.id], false)}><HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.5} />Restore</ContextMenuItem>
      : <ContextMenuItem onSelect={() => void archive([row.id], true)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} />Archive</ContextMenuItem>}
    <ContextMenuItem variant="destructive" onSelect={() => afterMenu(() => setDeleting([row.id]))}><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />Delete</ContextMenuItem>
  </>;

  const browser = <CollectionBrowser scope={scope} query={collections} activeId={browse.collectionId} onChoose={choose}
    archive={{ active: browse.archived, onChoose: () => { browse.setArchived(); setSelected(new Set()); setBrowsing(false); } }} />;
  const ids = [...selected];
  return <main className="page-shell">
    <HeaderActions>
      <Button asChild size="sm"><Link href={importHref}><HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.5} />Import PDF</Link></Button>
    </HeaderActions>
    <div className="grid min-w-0 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Sticks at its starting offset, so it stays put while the list scrolls. */}
      <aside className="hidden lg:sticky lg:top-[calc(var(--header-height,4rem)+var(--page-padding-y))] lg:block lg:max-h-[calc(100svh-var(--header-height,4rem)-2*var(--page-padding-y))] lg:self-start lg:overflow-y-auto">
        {browser}
      </aside>

      <section aria-label="Questions" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button className="lg:hidden" size="sm" variant="outline" onClick={() => setBrowsing(true)}>
            <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.5} />Collections
          </Button>
          <h1 className="min-w-0 truncate text-lg font-semibold" dir="auto">{heading}</h1>
          {browse.page.data && <span className="text-sm text-muted-foreground tabular-nums">{browse.total}</span>}
          <div className="w-full sm:ms-auto sm:w-72"><BankSearch browse={browse} id="qb-library-search" /></div>
        </div>
        <QuestionList browse={browse} activeId={active?.id} selected={selected} collections={list} menu={menu}
          onSelect={select}
          onOpen={row => selected.size ? select(row.id, !selected.has(row.id)) : open(row)}
          emptyAction={<Button asChild size="sm"><Link href={importHref}>Import PDF</Link></Button>} />
      </section>
    </div>

    <FloatingSheet open={browsing} onOpenChange={setBrowsing}>
      <FloatingSheetContent className="w-sm gap-0">
        <FloatingSheetHeader className="shrink-0 border-b px-6 py-5 pr-16"><FloatingSheetTitle className="text-xl font-normal">Collections</FloatingSheetTitle></FloatingSheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{browser}</div>
      </FloatingSheetContent>
    </FloatingSheet>

    <FloatingSheet open={!!active} onOpenChange={next => { if (!next && !pending) open(undefined); }}>
      <FloatingSheetContent className="w-xl gap-0" showCloseButton={!pending}>
        <FloatingSheetHeader className="shrink-0 gap-1 border-b px-6 py-5 pr-32">
          <FloatingSheetTitle className="flex items-center gap-2 text-xl font-semibold" dir="auto">
            {editing ? `Edit ${questionTitle(active?.printedNumber).toLowerCase()}` : questionTitle(active?.printedNumber)}
            {detail.data?.archived && <Badge variant="secondary" className="font-normal">Archived</Badge>}
          </FloatingSheetTitle>
          {active && <p className="truncate text-sm text-muted-foreground" dir="auto">
            {[active.file && fileTitle(active.file), active.page && `Page ${active.page}`].filter(Boolean).join(" · ")}
          </p>}
          {detail.data && !editing && <Button variant="ghost" size="sm" className="absolute top-4 right-14" onClick={() => setEditing(true)}>
            <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={1.5} />Edit
          </Button>}
        </FloatingSheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          {active && <QueryContent query={detail} label="question" isEmpty={() => false} emptyTitle="">
            {data => editing
              ? <QuestionEditor key={data.id} detail={data} formId="qb-edit" error={editError} pending={pending} onSubmit={changes => void save(data, changes)} />
              : <QuestionPreview detail={data} collections={list} academySlug={scope.academySlug}
                  onAnswer={pending ? undefined : key => void answer(data, key)}
                  onRemove={collection => void remove(collection, [data.id])} />}
          </QueryContent>}
        </div>
        {detail.data && <FloatingSheetFooter className="shrink-0 flex-row items-center gap-2 border-t px-6 py-4">
          {editing ? <>
            <Button variant="ghost" className="ms-auto" disabled={pending} onClick={() => { setEditing(false); setEditError(""); }}>Cancel</Button>
            <Button type="submit" form="qb-edit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </> : <>
            {(() => {
              const id = detail.data.id;
              const restoring = detail.data.archived;
              return <>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={restoring ? "Restore" : "Archive"} onClick={() => void archive([id], !restoring)}>
                    <HugeiconsIcon icon={restoring ? ArchiveRestoreIcon : Archive02Icon} strokeWidth={1.5} />
                  </Button></TooltipTrigger>
                  <TooltipContent>{restoring ? "Restore" : "Archive"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Delete" className="text-destructive hover:text-destructive" onClick={() => setDeleting([id])}>
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />
                  </Button></TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </>;
            })()}
            <span className="ms-auto" />
            <AddToCollection scope={scope} collections={list} questionIds={[detail.data.id]} label="Collection" variant="ghost" />
          </>}
        </FloatingSheetFooter>}
      </FloatingSheetContent>
    </FloatingSheet>

    <AddToCollection scope={scope} collections={list} questionIds={adding ?? []} open={!!adding} onOpenChange={next => { if (!next) setAdding(null); }} />

    <AlertDialog open={!!deleting} onOpenChange={next => { if (!next && !pending) setDeleting(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {plural(deleting?.length ?? 1)}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes {deleting?.length === 1 ? "it" : "them"} from the question bank. Copies already added to assessments stay.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={event => { event.preventDefault(); if (deleting) void destroy(deleting); }}>
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {selected.size > 0 && <ActionBar aria-label="Selected questions">
      <span role="status" className="px-2 font-medium tabular-nums">{selected.size} selected</span>
      <ActionBarSeparator />
      <AddToCollection scope={scope} collections={list} questionIds={ids} variant="ghost" label="Collection" onDone={() => setSelected(new Set())} />
      {removable && <Button size="sm" variant="ghost" onClick={() => void remove(removable, ids)}>
        <HugeiconsIcon icon={FolderRemoveIcon} strokeWidth={1.5} />Remove from {removable.kind === "topic" ? "topic" : "collection"}
      </Button>}
      {browse.archived
        ? <Button size="sm" variant="ghost" onClick={() => void archive(ids, false)}><HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.5} />Restore</Button>
        : <Button size="sm" variant="ghost" onClick={() => void archive(ids, true)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={1.5} />Archive</Button>}
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(ids)}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />Delete
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} />
      </Button>
    </ActionBar>}
  </main>;
}
