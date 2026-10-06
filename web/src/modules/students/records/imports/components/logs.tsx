"use client";
import { useCanonicalHref } from "@/modules/navigation";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconArrowLeft as ArrowLeft, IconHistory as History } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import { AcademyGate } from "@/modules/auth";
import { canImportStudents } from "../../permissions";
import { ImportMenu } from "./menu";
import { fetchImportLogs, importLogsQueryKey } from "../queries";
import { importTitle } from "../types";

const STATES = { staging: "Draft", reviewing: "In review", importing: "Importing", completed: "Completed", cancelled: "Discarded", blocked: "Blocked" };

export function ImportLogsPage() {
  return <AcademyGate>{(academy) => canImportStudents(academy.role) ? <Logs academyId={academy.id} /> : <p role="alert" className="p-8">Import logs are available to owners and admins.</p>}</AcademyGate>;
}

function Logs({ academyId }: { academyId: string }) {
  const href = useCanonicalHref();
  useBreadcrumbTitle("Import logs");
  const [page, setPage] = useState(0);
  const query = useQuery({ queryKey: importLogsQueryKey(academyId, page), queryFn: ({ signal }) => fetchImportLogs(academyId, page, signal), placeholderData: keepPreviousData });
  const data = query.data;
  return <main className="page-shell min-w-0">
    <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild><Link href={href("/app/students")} ><ArrowLeft />Students</Link></Button>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Import logs</h1>
    </div>
    {query.isError && <div role="alert" className="flex items-center gap-3 text-sm">Couldn’t load import logs.<Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button></div>}
    {!data && query.isPending ? <Skeleton className="h-72 w-full" /> : data?.logs.length === 0 ? (
      <Empty className="min-h-64 rounded-xl border border-dashed border-border bg-card/20 py-20">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon"><History aria-hidden="true" /></EmptyMedia>
          <EmptyTitle className="text-xl font-semibold">No imports yet</EmptyTitle>
          <EmptyDescription className="leading-[1.4em]">Completed imports appear here with who ran them and how many students were created, skipped, or failed.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button size="sm" variant="outline" asChild><Link href={href("/app/students")} >Back to students</Link></Button>
          <ImportMenu academyId={academyId} variant="default" size="sm" />
        </EmptyContent>
      </Empty>
    ) : <div className="overflow-x-auto rounded-lg border"><Table>
      <TableHeader><TableRow><TableHead className="pl-4">Import</TableHead><TableHead>File</TableHead><TableHead>Imported by</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Skipped</TableHead><TableHead>Failed</TableHead></TableRow></TableHeader>
      <TableBody>
        {data?.logs.map((log) => <TableRow key={log.id}>
          <TableCell className="pl-4 font-medium"><Link className="underline-offset-4 hover:underline" href={href(`/app/students/import?format=${log.format}&session=${log.id}`)}>{importTitle(log.importNumber)}</Link></TableCell>
          <TableCell dir="auto">{log.fileName}</TableCell><TableCell dir="auto" className="text-left">{log.importedByName}</TableCell><TableCell>{new Date(log.completedAt ?? log.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
          <TableCell><Badge variant="outline">{STATES[log.state]}</Badge></TableCell>
          <TableCell className="tabular-nums">{log.createdCount}</TableCell><TableCell className="tabular-nums">{log.skippedCount}</TableCell><TableCell className="tabular-nums">{log.failedCount}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table></div>}
    {data && data.total > 0 && <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{data.total} imports</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page + 1}</span><Button size="sm" variant="outline" disabled={(page + 1) * 20 >= data.total || query.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
  </main>;
}
