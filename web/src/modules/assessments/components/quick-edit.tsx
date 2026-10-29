"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { DiscardDialog } from "@/components/shared/assessment/discard";
import { Button } from "@/components/ui/button";
import { FloatingSheet, FloatingSheetClose, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { loadDetails } from "../details";
import { TYPE_LABELS, TYPE_ROUTES, type AssessmentRow } from "../types";
import type { SheetTab } from "./menu";
import { QuickEditForm, type EditStatus } from "./quick-form";
import { AssessmentSummary } from "./summary";

type Props = { academy: AcademyEntry; row: AssessmentRow; tab: SheetTab; opener: HTMLElement | null; onClose: () => void };

export function QuickEditSheet({ academy, row, tab: initialTab, opener, onClose }: Props) {
  const { item } = row;
  const archived = item.status === "archived";
  const [tab, setTab] = useState<SheetTab>(archived ? "summary" : initialTab);
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
  const fullEditor = href(`/app/${TYPE_ROUTES[item.type]}/${item.id}/edit`);
  function leave(destination?: string) {
    if (status.busy) return;
    if (status.dirty || status.uncertain) { setLeaving({ href: destination }); return; }
    onClose();
    if (destination) router.push(destination);
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
        <FloatingSheetContent className="w-2xl gap-0" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        }}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as SheetTab)} className="min-h-0 flex-1 gap-0">
            {/* The tabs are the visible title; the dialog keeps a name for assistive technology. */}
            <FloatingSheetHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b px-6 pt-3 pb-0">
              <FloatingSheetTitle className="sr-only">Edit {TYPE_LABELS[item.type].toLowerCase()}</FloatingSheetTitle>
              {/* Line tabs whose active underline sits on the header's bottom border. */}
              <TabsList variant="line" className="h-auto gap-5 p-0">
                {(["edit", "summary"] as const).map((value) => (
                  <TabsTrigger key={value} value={value} disabled={value === "edit" && archived}
                    className="h-auto flex-none rounded-none px-0 pt-1 pb-3 text-base font-semibold group-data-horizontal/tabs:after:bottom-[-1px]">
                    {value === "edit" ? "Edit" : "Summary"}
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
                {/* Both stay mounted so a draft survives Summary; each enters like the sheet itself slides in. */}
                <TabsContent value="edit" forceMount className="flex min-h-0 flex-col duration-200 ease-out data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-left-8 data-[state=inactive]:hidden">
                  {!archived && <QuickEditForm academy={academy} initial={details.data} onStatus={setStatus} onCancel={() => leave()} onSaved={onClose} fullEditor={fullEditor} onOpenEditor={openFullEditor} />}
                </TabsContent>
                <TabsContent value="summary" forceMount className="min-h-0 overflow-y-auto duration-200 ease-out data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-8 data-[state=inactive]:hidden">
                  <AssessmentSummary academyId={academy.id} row={row} details={details.data} active={tab === "summary"} onViewStudents={() => leave(row.href)} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </FloatingSheetContent>
      </FloatingSheet>
      <DiscardDialog noun={item.type} open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }} uncertain={status.uncertain}
        onDiscard={async () => { const destination = leaving?.href; setLeaving(null); onClose(); if (destination) router.push(destination); }} />
    </>
  );
}
