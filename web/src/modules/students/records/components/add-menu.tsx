"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseImportIcon, LeftToRightListBulletIcon, Link01Icon, UserAdd01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import Link from "next/link";

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
          <Button><HugeiconsIcon icon={UserAdd01Icon} />Add</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link href={href("/app/students/new")}><HugeiconsIcon icon={UserAdd01Icon} />Create a student</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={href("/app/manage/academy/enrollment")}><HugeiconsIcon icon={UserCheck01Icon} />Invite students<HugeiconsIcon icon={Link01Icon} className="ml-auto text-muted-foreground" /></Link>
          </DropdownMenuItem>
          {canImport && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><HugeiconsIcon icon={DatabaseImportIcon} />Import</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuLabel>New Import</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setFormat("csv")}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFormat("json")}>JSON</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFormat("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={href("/app/students/imports")}><HugeiconsIcon icon={LeftToRightListBulletIcon} />View logs</Link>
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
