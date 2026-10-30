"use client";

import { Fragment } from "react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { itemKey } from "../types";
import { AssessmentDate, AssessmentStatus, AssessmentTypeLabel, AudienceLine, MarkedCount, PartsSummary } from "./facts";
import { GroupToggle, type RowGroup } from "./groups";
import { LabelBadges } from "@/modules/labels";
import { AssessmentActions, AssessmentMenu, type RowActions } from "./menu";

/** Table view. The caller renders the empty state instead of this when there are no rows. */
type Props = { groups: RowGroup[]; collapsed: ReadonlySet<string>; onToggle: (key: string) => void; actions: RowActions };

export function AssessmentTable({ groups, collapsed, onToggle, actions }: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Details</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Parts</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Marked</TableHead>
            <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {group.type && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-10 bg-muted/40">
                    <GroupToggle group={group} open={!collapsed.has(group.key)} onClick={() => onToggle(group.key)} />
                  </TableCell>
                </TableRow>
              )}
              {!collapsed.has(group.key) && group.rows.map((row) => {
                const { item, href, audience } = row;
                return (
                // Fixed height so rows line up whatever their date or status wraps to.
                <AssessmentMenu key={itemKey(item)} row={row} actions={actions}>
                  <TableRow className="h-16 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                    <TableCell className="max-w-96">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={href} className="block min-w-0 truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{item.title}</Link>
                        <LabelBadges labels={item.labels} className="flex-nowrap" />
                      </div>
                      <AudienceLine audience={item.audience} name={audience} />
                    </TableCell>
                    <TableCell><AssessmentTypeLabel type={item.type} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground"><PartsSummary item={item} /></TableCell>
                    <TableCell><AssessmentStatus item={item} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground"><AssessmentDate item={item} /></TableCell>
                    <TableCell className="text-right"><MarkedCount item={item} /></TableCell>
                    <TableCell className="text-right"><AssessmentActions row={row} actions={actions} /></TableCell>
                  </TableRow>
                </AssessmentMenu>
              );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
