"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconArchive, IconDots, IconLock, IconLockOpen } from "@tabler/icons-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAcademyScope } from "@/modules/auth";
import { changeAssignment } from "../../actions";
import type { AssignmentPermissions } from "../../permissions";
import { assignmentsRootKey } from "../../queries";
import { ASSIGNMENT_ACTIONS, type Assignment, type AssignmentAction } from "../../types";

const COPY: Record<AssignmentAction, { title: string; body: string; confirm: string; done: string }> = {
  close: {
    title: "Close this assignment?",
    body: "No newly received work can be recorded. Staff can still mark work already received and announce results while the year is open.",
    confirm: "Close", done: "Assignment closed.",
  },
  reopen: {
    title: "Reopen this assignment?",
    body: "It becomes active again and accepts newly received work. Its students don’t change.",
    confirm: "Reopen", done: "Assignment reopened.",
  },
  archive: {
    title: "Archive this assignment?",
    body: "It becomes read-only and is hidden from the default list. Its history is kept. Archiving can’t be undone.",
    confirm: "Archive", done: "Assignment archived.",
  },
};

/** Owner/Admin lifecycle controls in a menu, each confirmed. */
export function LifecycleActions({ assignment, permissions }: { assignment: Assignment; permissions: AssignmentPermissions }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [pending, setPending] = useState<AssignmentAction | null>(null);
  const [running, setRunning] = useState(false);
  const menu = ASSIGNMENT_ACTIONS.filter((action) => permissions[action]);
  if (menu.length === 0) return null;

  async function run(action: AssignmentAction) {
    const academyId = assignment.academyId;
    setRunning(true);
    try {
      const result = await changeAssignment({ academyId, assignmentId: assignment.id, expectedVersion: assignment.version, action });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(COPY[action].done);
      setPending(null);
    } catch {
      if (isCurrentAcademy(academyId)) toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      // Refresh either way: a conflict or state error means the screen is out of date.
      await queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
      setRunning(false);
    }
  }

  const icons = { close: IconLock, reopen: IconLockOpen, archive: IconArchive } as const;
  const labels = { close: "Close", reopen: "Reopen", archive: "Archive" } as const;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions"><IconDots /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {menu.map((action) => {
            const Icon = icons[action];
            return (
              <DropdownMenuItem key={action} variant={action === "archive" ? "destructive" : "default"} onSelect={() => setPending(action)}>
                <Icon />{labels[action]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !running) setPending(null); }}>
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{COPY[pending].title}</AlertDialogTitle>
                <AlertDialogDescription>{COPY[pending].body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
                <AlertDialogAction variant={pending === "archive" ? "destructive" : "default"} disabled={running}
                  onClick={(event) => { event.preventDefault(); void run(pending); }}>
                  {running ? "Working…" : COPY[pending].confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
