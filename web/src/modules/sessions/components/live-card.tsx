"use client";

import Link from "next/link";
import { IconChevronRight, IconClock, IconMapPin, IconUser, IconUsers } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCanonicalHref } from "@/modules/navigation";
import type { LiveSession } from "../types";
import { formatClock, sessionAudience, startedByLabel } from "./format";

/** One live session; the whole card opens its details page. */
export function LiveSessionCard({ session }: { session: LiveSession }) {
  const href = useCanonicalHref();
  return (
    <Card size="sm" className="border-l-3 border-l-primary py-4 px-2 bg-card/40 shadow-sm ring-0 transition-colors hover:bg-muted/30">
      <CardContent className="py-1">
        <Link href={href(`/app/sessions/${session.id}`)} className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-medium">{session.scheduleTitle}</h3>
              <Badge className="text-[11px]">Live</Badge>
              <Badge variant="secondary" className="text-[11px]">{session.mandatory ? "Mandatory" : "Optional"}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{sessionAudience(session)}</span>
              <span className="flex items-center gap-1"><IconClock className="size-3" aria-hidden="true" />Started {formatClock(session.startedAt)}</span>
              <span className="flex items-center gap-1"><IconUser className="size-3" aria-hidden="true" />{startedByLabel(session.startedByName)}</span>
              <span className="flex items-center gap-1">
                <IconUsers className="size-3" aria-hidden="true" />
                {session.rosterCount} {session.mandatory ? "expected" : "eligible"}
              </span>
              {session.location ? (
                <span className="flex items-center gap-1"><IconMapPin className="size-3" aria-hidden="true" />{session.location}</span>
              ) : null}
            </div>
          </div>
          <IconChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
