"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconArchive, IconDots, IconLock, IconLockOpen, IconSend, IconArrowBackUp } from "@tabler/icons-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAcademyScope } from "@/modules/auth";
import { changeAssignment } from "../../actions";
import type { AssignmentPermissions } from "../../permissions";
import { assignmentsRootKey, loadAudiencePreview, previewQueryKey } from "../../queries";
import type { Assignment, AssignmentAction } from "../../types";

const number = new Intl.NumberFormat("en");

const COPY: Record<AssignmentAction, { title: string; body: string; confirm: string; done: string }> = {
  publish: {
    title: "Publish this assignment?",
    body: "The matching active students become its recipients now. Students who join or move later are not added. The audience and parts lock once publishing succeeds.",
    confirm: "Publish", done: "Assignment published.",
  },
  unpublish: {
    title: "Unpublish this assignment?",
    body: "It returns to draft and its recipient list is cleared. Publishing again builds a fresh list. This is only possible while no student has work on it.",
    confirm: "Unpublish", done: "Assignment returned to draft.",
  },
  close: {
    title: "Close this assignment?",
    body: "No new online submissions are accepted. Staff can still record physical work, mark, and publish results while the year is open.",
    confirm: "Close", done: "Assignment closed.",
  },
  reopen: {
    title: "Reopen this assignment?",
    body: "It becomes published again and accepts new submissions. Its recipients don’t change.",
    confirm: "Reopen", done: "Assignment reopened.",
  },
  archive: {
    title: "Archive this assignment?",
    body: "It becomes read-only and is hidden from the default list. Its history is kept. Archiving can’t be undone.",
    confirm: "Archive", done: "Assignment archived.",
  },
};

/** Owner/Admin lifecycle controls: Publish as the primary action, the rest in a menu, each confirmed. */
export function LifecycleActions({ assignment, permissions }: { assignment: Assignment; permissions: AssignmentPermissions }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const [pending, setPending] = useState<AssignmentAction | null>(null);
  const [running, setRunning] = useState(false);
  const menu = (["unpublish", "close", "reopen", "archive"] as const).filter((action) => permissions[action]);
  if (!permissions.publish && menu.length === 0) return null;

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

  const icons = { unpublish: IconArrowBackUp, close: IconLock, reopen: IconLockOpen, archive: IconArchive } as const;
  const labels = { unpublish: "Unpublish", close: "Close", reopen: "Reopen", archive: "Archive" } as const;

  return (
    <div className="flex gap-2">
      {permissions.publish && <Button onClick={() => setPending("publish")}><IconSend />Publish</Button>}
      {menu.length > 0 && (
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
      )}
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !running) setPending(null); }}>
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{COPY[pending].title}</AlertDialogTitle>
                <AlertDialogDescription>{COPY[pending].body}</AlertDialogDescription>
              </AlertDialogHeader>
              {pending === "publish" && <PublishCount assignment={assignment} />}
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
    </div>
  );
}

/** The live advisory count shown before publishing; the server recomputes it when publishing. */
function PublishCount({ assignment }: { assignment: Assignment }) {
  const audience = {
    academicYearId: assignment.academicYearId, audience: assignment.audience, levelId: assignment.levelId,
    trackId: assignment.trackId, groupIds: [...assignment.groupIds].sort(),
  };
  const preview = useQuery({
    queryKey: previewQueryKey(assignment.academyId, audience),
    queryFn: () => loadAudiencePreview(assignment.academyId, audience),
    staleTime: 0,
  });
  if (preview.isPending) return <p className="text-sm text-muted-foreground">Counting matching students…</p>;
  if (preview.isError) return <p className="text-sm text-muted-foreground">Couldn’t count matching students; publishing still checks them.</p>;
  const { recipientCount, uncodedCount } = preview.data;
  return (
    <p className="text-sm">
      {recipientCount === 0
        ? "No active students match this audience right now, so publishing will fail."
        : <>About <strong>{number.format(recipientCount)}</strong> student{recipientCount === 1 ? "" : "s"} will receive it{uncodedCount > 0 ? `, including ${number.format(uncodedCount)} without a student code` : ""}.</>}
    </p>
  );
}
