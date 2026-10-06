"use client";

import { useState } from "react";
import { IconSearch, IconSearchOff, IconUsers } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RosterEntry } from "../types";
import { formatPhone } from "./format";

/** The roster captured when the session started, with placement as it was then. */
export function RosterTable({ roster, mandatory }: { roster: RosterEntry[]; mandatory: boolean }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const rows = term
    ? roster.filter((entry) => [entry.fullName, entry.studentPhone, entry.parentPhone]
      .some((text) => text?.toLocaleLowerCase().includes(term)))
    : roster;

  return (
    <section aria-labelledby="roster-heading" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="roster-heading" className="flex items-center gap-2 text-sm font-semibold">
          {mandatory ? "Expected students" : "Eligible students"}
          <Badge variant="secondary">{roster.length}</Badge>
        </h2>
        {roster.length > 0 && (
          <InputGroup className="sm:max-w-xs">
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search students"
              aria-label="Search students"
            />
            <InputGroupAddon><IconSearch /></InputGroupAddon>
          </InputGroup>
        )}
      </div>

      {roster.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border bg-card/20 py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No students on this roster</EmptyTitle>
            <EmptyDescription>
              No active students matched this schedule’s audience when the session started.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty className="min-h-48 rounded-xl border border-dashed border-border py-14">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>No matching students</EmptyTitle>
            <EmptyDescription>Try a different search, or clear it to see the whole roster.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" variant="outline" onClick={() => setSearch("")}>Clear search</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Parent phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.annualStudentRecordId}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {entry.fullName}
                      {entry.archived ? <Badge variant="outline" className="text-[11px] text-muted-foreground">Archived</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell dir="ltr" className="text-left font-mono">{formatPhone(entry.studentPhone)}</TableCell>
                  <TableCell dir="ltr" className="text-left font-mono">{formatPhone(entry.parentPhone)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
