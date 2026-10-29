"use client";

import { Fragment } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatScore } from "@/lib/score";
import { itemKey } from "../types";
import { AssessmentDate, AssessmentStatus, AssessmentTypeLabel, AudienceLine, MarkedCount } from "./facts";
import { GroupToggle, type RowGroup } from "./groups";

/** Table view. The caller renders the empty state instead of this when there are no rows. */
type Props = { groups: RowGroup[]; collapsed: ReadonlySet<string>; onToggle: (key: string) => void };

export function AssessmentTable({ groups, collapsed, onToggle }: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Marked</TableHead>
            <TableHead className="text-right">Maximum marks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {group.type && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-10 bg-muted/40">
                    <GroupToggle group={group} open={!collapsed.has(group.key)} onClick={() => onToggle(group.key)} />
                  </TableCell>
                </TableRow>
              )}
              {!collapsed.has(group.key) && group.rows.map(({ item, href, audience }) => (
                // Fixed height so rows line up whatever their date or status wraps to.
                <TableRow key={itemKey(item)} className="h-16">
                  <TableCell className="max-w-80">
                    <Link href={href} className="block truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{item.title}</Link>
                    <AudienceLine audience={item.audience} name={audience} />
                  </TableCell>
                  <TableCell><AssessmentTypeLabel type={item.type} /></TableCell>
                  <TableCell><AssessmentStatus item={item} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground"><AssessmentDate item={item} /></TableCell>
                  <TableCell className="text-right"><MarkedCount item={item} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatScore(item.maxScore)}</TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
