"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArchive, IconArchiveOff, IconCalendar, IconClipboardList, IconClock, IconDots, IconUser, IconUsers } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCanonicalHref } from "@/modules/navigation";
import type { PastSession } from "../types";
import { ArchiveSessionDialog } from "./archive-dialog";
import { formatClock, formatDay, sessionAudience, startedByLabel } from "./format";

/**
 * One finished session; the card opens its details page, the menu views its attendance and, for
 * managers, archives or restores it (the server re-checks role and year).
 */
export function HistorySessionCard({ session, canManage }: { session: PastSession; canManage: boolean }) {
  const href = useCanonicalHref();
  const [changing, setChanging] = useState(false);
  const archived = session.sessionArchivedAt !== null;
  const detailsHref = href(`/app/attendance/${session.id}`);
  return (
    <Card size="sm" className="bg-card/40 py-4 px-2 shadow-sm border-l-3 border-foreground/20 ring-0 transition-colors hover:bg-muted/30">
      <CardContent className="py-1">
        <div className="flex items-center gap-3">
        <Link href={detailsHref} className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-medium">{session.scheduleTitle}</h3>
              <Badge variant="secondary" className="text-[11px]">{session.endReason === "auto" ? "Auto-closed" : "Ended"}</Badge>
              {archived && <Badge variant="outline" className="text-[11px]"><IconArchive aria-hidden="true" />Archived · not counted</Badge>}
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
          <DropdownMenuContent align="end" className="w-fit">
            <DropdownMenuItem asChild className="whitespace-nowrap">
              <Link href={href(`/app/attendance/${session.id}`)}><IconClipboardList />View attendance</Link>
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="whitespace-nowrap" onSelect={() => setChanging(true)}>
                  {archived ? <><IconArchiveOff />Restore…</> : <><IconArchive />Archive…</>}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </CardContent>
      {canManage && (
        <ArchiveSessionDialog
          academyId={session.academyId}
          sessionId={session.id}
          mode={archived ? "restore" : "archive"}
          open={changing}
          onClose={() => setChanging(false)}
        />
      )}
    </Card>
  );
}
