"use client";

import { useState } from "react";
import Link from "next/link";
import { IconDatabaseImport, IconList } from "@tabler/icons-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ImportFormat } from "../types";
import { ImportDialog } from "./start-dialog";

/** The Import button: choose a format, then pick a file in the start dialog. Owners and admins only. */
export function ImportMenu({ academyId, showLogs = false, variant = "outline", size }: { academyId: string; showLogs?: boolean; variant?: "outline" | "default", size?: "sm" | "default" }) {
  const [format, setFormat] = useState<ImportFormat | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size}><IconDatabaseImport />Import</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>New Import</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setFormat("csv")}>CSV</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFormat("json")}>JSON</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFormat("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
          {showLogs && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/students/imports"><IconList />View logs</Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportDialog academyId={academyId} format={format} onFormatChange={setFormat} onClose={() => setFormat(null)} />
    </>
  );
}
