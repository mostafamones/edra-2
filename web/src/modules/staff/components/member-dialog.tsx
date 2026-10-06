"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { changeStaffMemberRole, removeStaffMember } from "../actions";
import { staffQueryKeys } from "../queries";
import type { TeamMember } from "../types";

export type MemberAction = { member: TeamMember; kind: "remove" | "promote" | "demote" };

const ACTION_COPY = {
  remove: {
    title: (name: ReactNode) => `Remove ${name}?`,
    description: "They’ll lose access to this academy. You can invite them again later.",
    label: "Remove member", pending: "Removing…", success: "Member removed.",
    error: "Couldn’t remove this member. Please try again.",
  },
  promote: {
    title: (name: ReactNode) => `Promote ${name} to admin?`,
    description: "They’ll gain admin permissions in this academy.",
    label: "Promote", pending: "Promoting…", success: "Member promoted to admin.",
    error: "Couldn’t promote this member. Please try again.",
  },
  demote: {
    title: (name: ReactNode) => `Demote ${name} to instructor?`,
    description: "They’ll become an instructor and lose admin permissions.",
    label: "Demote", pending: "Demoting…", success: "Member demoted to instructor.",
    error: "Couldn’t demote this member. Please try again.",
  },
};

export function MemberActionDialog({ academyId, userId, action, onClose }: {
  academyId: string; userId: string; action: MemberAction | null; onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();

  // Keep the last action while the dialog animates closed so its text doesn't change mid-fade.
  const [shown, setShown] = useState(action);
  if (action && action !== shown) setShown(action);

  const copy = ACTION_COPY[shown?.kind ?? "remove"];
  const name = shown?.member.profiles.full_name?.trim() || "this member";

  async function submit() {
    if (!action || pending) return;
    setPending(true);
    try {
      const result = action.kind === "remove"
        ? await removeStaffMember(academyId, action.member.user_id)
        : await changeStaffMemberRole(academyId, action.member.user_id, action.kind === "promote" ? "admin" : "instructor");
      if (!isCurrent(academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      queryClient.setQueryData<TeamMember[]>(staffQueryKeys.members(userId, academyId), (members) => {
        if (!members) return members;
        if (action.kind === "remove") return members.filter((m) => m.user_id !== action.member.user_id);
        const role: TeamMember["role"] = action.kind === "promote" ? "admin" : "instructor";
        const roleOrder = { owner: 0, admin: 1, instructor: 2 };
        return members.map((m) => m.user_id === action.member.user_id ? { ...m, role } : m)
          .sort((a, b) => roleOrder[a.role] - roleOrder[b.role]
            || (a.profiles.full_name ?? "").localeCompare(b.profiles.full_name ?? "")
            || a.user_id.localeCompare(b.user_id));
      });
      toast.success(copy.success);
      onClose();
    } catch {
      if (isCurrent(academyId)) toast.error(copy.error);
    } finally {
      setPending(false);
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.members(userId, academyId) });
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.invitations(userId, academyId) });
    }
  }

  return <AlertDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{copy.title(<span className="font-semibold">{name}</span>)}</AlertDialogTitle>
        <AlertDialogDescription>{copy.description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant={shown?.kind === "promote" ? "default" : "destructive"} disabled={pending} onClick={(event) => { event.preventDefault(); void submit(); }}>{pending ? copy.pending : copy.label}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
