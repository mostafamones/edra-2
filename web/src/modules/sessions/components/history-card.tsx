"use client";

import { useState } from "react";
import Link from "next/link";
import { IconCalendar, IconClipboardList, IconClock, IconDots, IconTrash, IconUser, IconUsers } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCanonicalHref } from "@/modules/navigation";
import type { PastSession } from "../types";
import { DeleteSessionDialog } from "./delete-dialog";
import { formatClock, formatDay, sessionAudience, startedByLabel } from "./format";

/** One finished session; the card opens its details page, the menu views attendance or deletes it. */
export function HistorySessionCard({ session, canDelete }: { session: PastSession; canDelete: boolean }) {
  const href = useCanonicalHref();
  const [deleting, setDeleting] = useState(false);
  const detailsHref = href(`/app/sessions/${session.id}`);
  return (
    <Card size="sm" className="bg-card/40 shadow-sm border-l-3 border-foreground/20 ring-0 transition-colors hover:bg-muted/30">
      <CardContent className="py-1">
        <div className="flex items-center gap-3">
        <Link href={detailsHref} className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-medium">{session.scheduleTitle}</h3>
              <Badge variant="secondary" className="text-[11px]">{session.endReason === "auto" ? "Auto-closed" : "Ended"}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{sessionAudience(session)}</span>
              <span className="flex items-center gap-1"><IconCalendar className="size-3" aria-hidden="true" />{formatDay(session.startedAt)}</span>
              <span className="flex items-center gap-1">
                <IconClock className="size-3" aria-hidden="true" />{formatClock(session.startedAt)} – {formatClock(session.endedAt)}
              </span>
              <span className="flex items-center gap-1"><IconUser className="size-3" aria-hidden="true" />{startedByLabel(session.startedByName)}</span>
              <span className="flex items-center gap-1"><IconUsers className="size-3" aria-hidden="true" />{session.rosterCount}</span>
            </div>
          </div>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0 text-muted-foreground" aria-label={`Actions for ${session.scheduleTitle}`}>
              <IconDots />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild className="whitespace-nowrap">
              <Link href={href(`/app/sessions/${session.id}/attendance`)}><IconClipboardList />View attendance</Link>
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="whitespace-nowrap" onSelect={() => setDeleting(true)}><IconTrash />Delete</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </CardContent>
      {canDelete && (
        <DeleteSessionDialog academyId={session.academyId} sessionId={session.id} title={session.scheduleTitle} open={deleting} onClose={() => setDeleting(false)} />
      )}
    </Card>
  );
}
