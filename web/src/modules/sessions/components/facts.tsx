import type { ReactNode } from "react";
import { IconClockPlay, IconMapPin, IconUser, IconUsersGroup, type Icon } from "@tabler/icons-react";

import { Card, CardAction, CardContent } from "@/components/ui/card";
import type { SessionDetail } from "../types";
import { formatClock, formatMoment, sessionAudience, startedByLabel } from "./format";

function Fact({ icon: Icon, label, value, note }: { icon: Icon; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card size="sm" className="bg-card/40 shadow-sm">
      <CardContent className="relative flex flex-col gap-0.5">
        <span className="absolute top-0 right-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate pr-11 text-sm font-semibold">{value}</span>
        {note ? <span className="pr-11 text-xs text-muted-foreground">{note}</span> : null}
      </CardContent>
    </Card>
  );
}

/** The four headline facts of a session: time, location, who started it, and its audience. */
export function SessionFacts({ session }: { session: SessionDetail }) {
  const live = session.state === "live";
  const closing = live
    ? `Closes automatically at ${formatClock(session.autoEndAt)}`
    : session.endedAt
      ? `Ended ${formatClock(session.endedAt)} · ${session.endReason === "auto" ? "closed automatically" : `by ${startedByLabel(session.endedByName)}`}`
      : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Fact icon={IconClockPlay} label="Started" value={formatMoment(session.startedAt)} note={closing} />
      <Fact
        icon={IconUsersGroup}
        label="Audience"
        value={sessionAudience(session)}
        note={`${session.roster.length} ${session.roster.length === 1 ? "student" : "students"}`}
      />
      <Fact icon={IconMapPin} label="Location" value={session.location ?? "Not set"} />
      <Fact icon={IconUser} label="Started by" value={startedByLabel(session.startedByName)} />
    </div>
  );
}
