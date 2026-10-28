"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Task01Icon } from "@hugeicons/core-free-icons";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { staffAcademyPath } from "@/lib/routing";
import type { AcademyEntry } from "@/modules/academies";

import { PARTICIPATION_LABELS } from "../../records/validation";
import { listStudentBookingRegistrations } from "../actions";
import { REGISTRATIONS_PAGE_SIZE } from "../types";

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Successful booking registrations of the open year. They are ordinary student records. */
export function BookingRegistrationsList({ academy }: { academy: AcademyEntry }) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["student-booking-registrations", academy.id, page],
    queryFn: () => listStudentBookingRegistrations(academy.id, page),
    placeholderData: keepPreviousData,
  });

  let body;
  if (query.isPending) body = <Skeleton className="h-32 w-full" />;
  else if (query.isError) {
    body = (
      <Alert variant="destructive">
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
        <AlertTitle>Couldn’t load registrations</AlertTitle>
        <AlertDescription>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  } else if (query.data.total === 0) {
    body = (
      <Empty className="rounded-lg bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon"><HugeiconsIcon icon={Task01Icon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No registrations yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  } else {
    const pages = Math.ceil(query.data.total / REGISTRATIONS_PAGE_SIZE);
    body = (
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.rows.map((row) => (
                <TableRow key={row.recordId}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" href={staffAcademyPath(academy.slug, `/students?q=${encodeURIComponent(row.studentPhone)}`)}>{row.fullName}</Link>
                    {row.archived && <Badge variant="secondary" className="ml-2">Archived</Badge>}
                  </TableCell>
                  <TableCell dir="ltr">{row.studentPhone}</TableCell>
                  <TableCell>{[row.levelName, row.trackName].filter(Boolean).join(" · ")}</TableCell>
                  <TableCell>{row.groupName ?? "—"}</TableCell>
                  <TableCell>{PARTICIPATION_LABELS[row.participationType]}</TableCell>
                  <TableCell>{when.format(new Date(row.createdAt))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
            <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </div>
    );
  }
  return body;
}
