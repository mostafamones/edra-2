import { IconAlertCircle, IconCircleCheck } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { StudentAcademy } from "../types";

const PARTICIPATION = { in_person: "In person", online_only: "Online only" } as const;

/** A connected student's academy: participation, and why online access is unavailable when it is. */
export function StudentAcademyHome({ academy }: { academy: StudentAcademy }) {
  const record = academy.record;
  const year = academy.startYear ? `${academy.startYear}–${academy.startYear + 1}` : null;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{academy.academy.name}</h1>
        {year && <p className="mt-1 text-sm text-muted-foreground">Academic year {year}</p>}
      </div>

      {academy.access === "suspended" && (
        <Alert variant="destructive">
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>Online access is suspended</AlertTitle>
          <AlertDescription>Contact the academy staff to restore your access.</AlertDescription>
        </Alert>
      )}
      {academy.access === "no_current_year" && (
        <Alert>
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>No participation this year</AlertTitle>
          <AlertDescription>Open the academy’s current invite link to join this academic year.</AlertDescription>
        </Alert>
      )}

      {record && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {record.fullName}
              {academy.access === "active" && (
                <Badge variant="secondary"><IconCircleCheck aria-hidden="true" />Connected</Badge>
              )}
            </CardTitle>
            <CardDescription>Your current participation</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <Detail label="Program" value={[record.levelName, record.trackName].filter(Boolean).join(" · ") || "—"} />
              <Detail label="Group" value={record.groupName ?? "Not assigned yet"} />
              <Detail label="Student type" value={PARTICIPATION[record.participationType]} />
            </dl>
          </CardContent>
        </Card>
      )}

    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
