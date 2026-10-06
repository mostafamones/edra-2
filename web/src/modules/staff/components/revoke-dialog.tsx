"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";

import { revokeStaffInvitation } from "../actions";
import { ROLE_LABELS } from "../format";
import { staffQueryKeys } from "../queries";
import type { InvitationRow } from "../types";

export function RevokeDialog({ academyId, userId, invitation, onClose }: {
  academyId: string;
  userId: string;
  invitation: InvitationRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  const [pending, setPending] = useState(false);
  // Keep the last invitation while the dialog animates closed so its text doesn't change mid-fade.
  const [shown, setShown] = useState(invitation);
  if (invitation && invitation !== shown) setShown(invitation);

  async function revoke() {
    if (!invitation || pending) return;
    setPending(true);
    try {
      const result = await revokeStaffInvitation(academyId, invitation.id);
      if (!isCurrent(academyId)) return;
      if (result.ok) {
        queryClient.setQueriesData<InvitationRow[]>({ queryKey: staffQueryKeys.invitations(userId, academyId) }, (rows) => {
          if (!Array.isArray(rows)) return rows;
          return rows.map((row) => row.id === invitation.id
            ? { ...row, status: "revoked" as const, revokedAt: new Date().toISOString(), invitationLink: null } : row);
        });
        toast.success("Invitation revoked. The link no longer works.");
      } else toast.error(result.message);
      onClose();
    } catch {
      if (isCurrent(academyId)) toast.error("The invitation couldn’t be revoked. Check your connection and try again.");
    } finally {
      setPending(false);
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.invitations(userId, academyId) });
    }
  }

  return (
    <AlertDialog open={Boolean(invitation)} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            {shown && `The ${ROLE_LABELS[shown.role]} invitation for ${shown.phone} will stop working immediately. `}
            Anyone who already joined keeps their membership. You can create a new invitation afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={(event) => { event.preventDefault(); void revoke(); }}>
            {pending ? "Revoking…" : "Revoke invitation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
