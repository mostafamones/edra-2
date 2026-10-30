"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { DiscardDialog } from "@/components/shared/assessment/discard";
import { MarkingGuard } from "@/components/shared/assessment/marking/guard";
import { inStudentList } from "@/components/shared/assessment/marking/sheet";
import { Button } from "@/components/ui/button";
import { FloatingSheet, FloatingSheetClose, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AcademyEntry } from "@/modules/academies";
import { AssignmentMarking, isManager } from "@/modules/assignments";
import { ExamMarking } from "@/modules/exams";
import { useCanonicalHref } from "@/modules/navigation";
import { QuizMarking } from "@/modules/quizzes";
import { detailsPermissions, loadDetails, type AssessmentDetails } from "../details";
import { assessmentsRootKey } from "../queries";
import { TYPE_LABELS, TYPE_ROUTES, type AssessmentRow } from "../types";
import type { SheetTab } from "./menu";
import { QuickEditForm, type EditStatus } from "./quick-form";
import { AssessmentSummary } from "./summary";

type Props = { academy: AcademyEntry; row: AssessmentRow; tab: SheetTab; opener: HTMLElement | null; onClose: () => void };

const TAB_LABELS: Record<SheetTab, string> = { edit: "Edit", summary: "Summary", mark: "Mark" };

/** The owning type's marking flow, inline under the sheet's guard. */
function MarkTab({ academy, details, guard }: { academy: AcademyEntry; details: AssessmentDetails; guard: (action: () => void) => void }) {
  if (details.type === "assignment") return <AssignmentMarking assignment={details.value} manager={isManager(academy.role)} embedded={guard} />;
  return details.type === "quiz" ? <QuizMarking academy={academy} quiz={details.value} embedded={guard} /> : <ExamMarking academy={academy} exam={details.value} embedded={guard} />;
}

export function QuickEditSheet(props: Props) {
  return <MarkingGuard>{(guard) => <Content {...props} guard={guard} />}</MarkingGuard>;
}

function Content({ academy, row, tab: initialTab, opener, onClose, guard }: Props & { guard: (action: () => void) => void }) {
  const { item } = row;
  const archived = item.status === "archived";
  const [tab, setTab] = useState<SheetTab>(archived ? "summary" : initialTab);
  // Mounted on first use, then kept so a student's unsaved marks survive switching tabs.
  const [markOpened, setMarkOpened] = useState(!archived && initialTab === "mark");
  const queryClient = useQueryClient();
  const href = useCanonicalHref();
  const router = useRouter();
  const [status, setStatus] = useState<EditStatus>({ dirty: false, busy: false, uncertain: false });
  const [leaving, setLeaving] = useState<{ href?: string } | null>(null);
  const details = useQuery({
    queryKey: ["assessment-quick-edit", academy.id, item.type, item.id],
    queryFn: () => loadDetails(academy.id, item.type, item.id),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const canMark = details.data !== undefined && detailsPermissions(academy.role, details.data).mark;
  // shortcut: list rows don't carry assignment readiness, so the menu's Mark on an unready assignment lands on Summary; add `ready` to list_assessments to hide it there.
  const shownTab = tab === "mark" && details.isSuccess && !canMark ? "summary" : tab;
  // Kept while loading if asked for: without it, the dialog's first focus lands on Edit, which selects it.
  const showMark = canMark || (details.isPending && tab === "mark");
  const fullEditor = href(`/app/${TYPE_ROUTES[item.type]}/${item.id}/edit`);
  /** Marks saved here change the list's counts and the summary. */
  function close() {
    if (markOpened) void queryClient.invalidateQueries({ queryKey: assessmentsRootKey(academy.id) });
    onClose();
  }
  function changeTab(value: SheetTab) {
    if (value === "mark") setMarkOpened(true);
    if (value === "summary" && markOpened) void queryClient.invalidateQueries({ queryKey: [...assessmentsRootKey(academy.id), "summary"] });
    setTab(value);
  }
  function leave(destination?: string) {
    guard(() => {
      if (status.busy) return;
      if (status.dirty || status.uncertain) { setLeaving({ href: destination }); return; }
      close();
      if (destination) router.push(destination);
    });
  }
  function openFullEditor(event: MouseEvent<HTMLAnchorElement>) { event.preventDefault(); leave(fullEditor); }

  useEffect(() => {
    if (!status.dirty && !status.busy && !status.uncertain) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [status]);

  return (
    <>
      <FloatingSheet open onOpenChange={(open) => { if (!open) leave(); }}>
        <FloatingSheetContent className="w-2xl gap-0" showCloseButton={false} aria-describedby={undefined} onInteractOutside={(event) => { if (inStudentList(event.target)) event.preventDefault(); }} onOpenAutoFocus={(event) => {
          // Mark has no tab until it's confirmed ready; first focus would land on Edit, which selects it.
          if (tab === "mark") { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }
        }} onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        }}>
          <Tabs value={shownTab} onValueChange={(value) => changeTab(value as SheetTab)} className="min-h-0 flex-1 gap-0">
            {/* The tabs are the visible title; the dialog keeps a name for assistive technology. */}
            <FloatingSheetHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b px-6 pt-3 pb-0">
              <FloatingSheetTitle className="sr-only">Edit {TYPE_LABELS[item.type].toLowerCase()}</FloatingSheetTitle>
              {/* Line tabs whose active underline sits on the header's bottom border. */}
              <TabsList variant="line" className="h-auto gap-5 p-0">
                {(["edit", "summary", ...(showMark ? ["mark"] as const : [])] as const).map((value) => (
                  <TabsTrigger key={value} value={value} disabled={value !== "summary" && archived}
                    className="h-auto flex-none rounded-none px-0 pt-1 pb-3 text-base font-semibold group-data-horizontal/tabs:after:bottom-[-1px]">
                    {TAB_LABELS[value]}
                  </TabsTrigger>
                ))}
              </TabsList>
              <FloatingSheetClose asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="mb-2" aria-label="Close">
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} aria-hidden="true" />
                </Button>
              </FloatingSheetClose>
            </FloatingSheetHeader>
            {details.isPending || details.isError ? (
              <>
                {details.isPending ? <div role="status" aria-label="Loading assessment details" className="space-y-4 p-4"><Skeleton className="h-10" /><Skeleton className="h-32" /></div>
                  : <div className="flex flex-col gap-3 p-4"><p role="alert">Couldn’t load assessment details.</p><Button variant="outline" onClick={() => void details.refetch()}>Retry</Button></div>}
                <div className="mt-auto flex justify-end px-6 py-4"><Button variant="outline" onClick={() => leave()}>Cancel</Button></div>
              </>
            ) : (
              <>
                {/* They stay mounted so a draft survives switching tabs; each enters like the sheet itself slides in. */}
                <TabsContent value="edit" forceMount className="flex min-h-0 flex-col duration-200 ease-out data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-left-8 data-[state=inactive]:hidden">
                  {!archived && <QuickEditForm academy={academy} initial={details.data} onStatus={setStatus} onCancel={() => leave()} onSaved={() => guard(close)} fullEditor={fullEditor} onOpenEditor={openFullEditor} />}
                </TabsContent>
                <TabsContent value="summary" forceMount className="min-h-0 overflow-y-auto duration-200 ease-out data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-8 data-[state=inactive]:hidden">
                  <AssessmentSummary academyId={academy.id} row={row} details={details.data} onViewStudents={() => leave(row.href)} />
                </TabsContent>
                {canMark && (
                  <TabsContent value="mark" forceMount className="flex min-h-0 flex-col duration-200 ease-out data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-8 data-[state=inactive]:hidden">
                    {markOpened && <MarkTab academy={academy} details={details.data} guard={guard} />}
                  </TabsContent>
                )}
              </>
            )}
          </Tabs>
        </FloatingSheetContent>
      </FloatingSheet>
      <DiscardDialog noun={item.type} open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }} uncertain={status.uncertain}
        onDiscard={async () => { const destination = leaving?.href; setLeaving(null); close(); if (destination) router.push(destination); }} />
    </>
  );
}
