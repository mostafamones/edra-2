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
import type { AcademyEntry } from "@/modules/academies";
import { useCanonicalHref } from "@/modules/navigation";
import { loadDetails } from "../details";
import { TYPE_LABELS, TYPE_ROUTES, type AssessmentListItem } from "../types";
import { QuickEditForm, type EditStatus } from "./quick-form";

type Props = { academy: AcademyEntry; item: AssessmentListItem; opener: HTMLElement | null; onClose: () => void };

export function QuickEditSheet({ academy, item, opener, onClose }: Props) {
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
        <FloatingSheetContent className="w-lg gap-0" showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        }}>
          <FloatingSheetHeader className="shrink-0 flex-row items-center justify-between gap-3 border-b px-6 py-4">
            <FloatingSheetTitle className="font-semibold">Edit {TYPE_LABELS[item.type].toLowerCase()}</FloatingSheetTitle>
            <FloatingSheetClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close">
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </FloatingSheetClose>
          </FloatingSheetHeader>
          {details.isPending ? <div role="status" aria-label="Loading assessment details" className="space-y-4 p-4"><Skeleton className="h-10" /><Skeleton className="h-32" /></div>
            : details.isError ? <div className="flex flex-col gap-3 p-4"><p role="alert">Couldn’t load assessment details.</p><Button variant="outline" onClick={() => void details.refetch()}>Retry</Button></div>
              : <QuickEditForm academy={academy} initial={details.data} onStatus={setStatus} onCancel={() => leave()} onSaved={onClose} fullEditor={fullEditor} onOpenEditor={openFullEditor} />}
          {(details.isPending || details.isError) && <div className="mt-auto flex justify-end px-6 py-4"><Button variant="outline" onClick={() => leave()}>Cancel</Button></div>}
        </FloatingSheetContent>
      </FloatingSheet>
      <DiscardDialog noun={item.type} open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }} uncertain={status.uncertain}
        onDiscard={async () => { const destination = leaving?.href; setLeaving(null); onClose(); if (destination) router.push(destination); }} />
    </>
  );
}
