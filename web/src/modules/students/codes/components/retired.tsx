"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconArchive, IconArrowBackUp, IconSearch, IconSearchOff } from "@tabler/icons-react";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAcademyScope } from "@/modules/auth";

import { unretireStudentCode } from "../actions";
import { fetchRetiredStudentCodes, RETIRED_PAGE_SIZE, studentCodeQueryKeys } from "../queries";
import type { RetiredStudentCode } from "../types";

const REASONS: Record<RetiredStudentCode["reason"], string> = {
  manual: "Retired by staff",
  level_changed: "Level changed",
  year_closed: "Year closed",
};

type Props = {
  academyId: string;
  levelNames: Record<string, string>;
  /** Owners and admins can unretire; other staff see the list only. */
  canUnretire: boolean;
};

/** Every retired code with the student who held it. Unretiring frees a code to be issued again. */
export function RetiredStudentCodes({ academyId, levelNames, canUnretire }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<RetiredStudentCode | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(input.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  const query = useQuery({
    queryKey: [...studentCodeQueryKeys.retired(academyId), search, page],
    queryFn: ({ signal }) => fetchRetiredStudentCodes(academyId, search, page, signal),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / RETIRED_PAGE_SIZE)) : 1;

  async function unretire(row: RetiredStudentCode) {
    setWorking(true);
    setError("");
    try {
      const result = await unretireStudentCode(academyId, row.id);
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) {
        setError(result.message);
        if (result.code === "stale_code" || result.code === "not_found") void queryClient.invalidateQueries({ queryKey: studentCodeQueryKeys.retired(academyId) });
        return;
      }
      setTarget(null);
      toast.success(`${row.code} can be used again.`);
      await queryClient.invalidateQueries({ queryKey: studentCodeQueryKeys.retired(academyId) });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  let body: React.ReactNode;
  if (query.isPending) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (query.isError || !data) {
    body = (
      <Alert variant="destructive">
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>Couldn’t load retired codes</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  } else if (data.total === 0) {
    body = search ? (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No matching codes</EmptyTitle>
          <EmptyDescription>No retired code or student matches “{search}”.</EmptyDescription>
        </EmptyHeader>
        <Button type="button" variant="outline" size="sm" onClick={() => setInput("")}>Clear search</Button>
      </Empty>
    ) : (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconArchive aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No retired codes</EmptyTitle>
          <EmptyDescription>Codes appear here after they’re retired.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="hidden sm:table-cell">Reason</TableHead>
              <TableHead className="hidden md:table-cell">Retired</TableHead>
              {canUnretire && <TableHead className="w-0"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono font-medium">{row.code}</TableCell>
                <TableCell>
                  <span className="block max-w-48 truncate" title={row.studentName}>{row.studentName}</span>
                  <span className="text-xs text-muted-foreground">{levelNames[row.levelId] ?? row.levelId}</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{REASONS[row.reason]}</TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{format(new Date(row.retiredAt), "MMM d, yyyy")}</TableCell>
                {canUnretire && (
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setError(""); setTarget(row); }}>
                      <IconArrowBackUp aria-hidden="true" data-icon="inline-start" />Unretire
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-4 text-sm text-muted-foreground">
            <span>Page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retired codes</CardTitle>
        <CardDescription>Retired codes can’t be reused unless you unretire them.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(data?.total ?? 0) > 0 || search ? (
          <InputGroup>
            <InputGroupAddon><IconSearch aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search code or student" aria-label="Search retired codes" />
          </InputGroup>
        ) : null}
        {body}
      </CardContent>
      <AlertDialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !working) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unretire {target?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be reserved and can be given to any student. It isn’t returned to {target?.studentName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <Button type="button" onClick={() => target && void unretire(target)} disabled={working}>{working ? "Unretiring…" : "Unretire"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
