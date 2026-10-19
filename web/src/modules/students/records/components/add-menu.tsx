"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconDatabaseImport, IconLink, IconList, IconUserPlus, IconUserShare } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanonicalHref } from "@/modules/navigation";
import { ImportDialog } from "../imports/components/start-dialog";
import type { ImportFormat } from "../imports/types";

/** Add student: the record form, the academy's student invite link (in settings), and, for owners and admins, imports. */
export function AddStudentMenu({ academyId, canImport }: { academyId: string; canImport: boolean }) {
  const href = useCanonicalHref();
  const [format, setFormat] = useState<ImportFormat | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button><IconUserPlus />Add student<IconChevronDown /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link href={href("/app/students/new")}><IconUserPlus />Add a student</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={href("/app/manage/student-enrollment")}><IconUserShare />Invite student<IconLink className="ml-auto text-muted-foreground" /></Link>
          </DropdownMenuItem>
          {canImport && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><IconDatabaseImport />Import</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuLabel>New Import</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setFormat("csv")}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFormat("json")}>JSON</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFormat("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={href("/app/students/imports")}><IconList />View logs</Link>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canImport && <ImportDialog academyId={academyId} format={format} onFormatChange={setFormat} onClose={() => setFormat(null)} />}
    </>
  );
}
