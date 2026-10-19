"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAcademyScope } from "@/modules/auth";
import { changeStaffMemberRole, removeStaffMember, restoreStaffMember, suspendStaffMember } from "../actions";
import { accountName } from "@/modules/account/contract";

import { ROLE_LABELS } from "../format";
import type { InvitableRole } from "../permissions";
import { sortTeamMembers, staffQueryKeys } from "../queries";
import type { TeamMember } from "../types";

export type MemberAction =
  | { member: TeamMember; kind: "remove" | "suspend" | "restore" }
  | { member: TeamMember; kind: "role"; role: InvitableRole };

type Copy = {
  title: (name: ReactNode) => ReactNode;
  description: string;
  label: string; pending: string; success: string; unchanged: string;
  destructive: boolean;
};

function copyFor(action: MemberAction): Copy {
  switch (action.kind) {
    case "remove": return {
      title: (name) => <>Remove {name}?</>,
      description: "They’ll lose access to this academy and need a new invitation to return. Their earlier work stays attributed to them.",
      label: "Remove member", pending: "Removing…", success: "Member removed.", unchanged: "This member was already removed.",
      destructive: true,
    };
    case "suspend": return {
      title: (name) => <>Suspend {name}?</>,
      description: "They’ll immediately lose access to this academy. Their membership, role and earlier work are kept, and you can restore their access later. Their other academies are not affected.",
      label: "Suspend access", pending: "Suspending…", success: "Access suspended.", unchanged: "This member was already suspended.",
      destructive: true,
    };
    case "restore": return {
      title: (name) => <>Restore {name}’s access?</>,
      description: `They’ll regain access to this academy as ${ROLE_LABELS[action.member.role]}.`,
      label: "Restore access", pending: "Restoring…", success: "Access restored.", unchanged: "This member already has access.",
      destructive: false,
    };
    case "role": return {
      title: (name) => <>Make {name} {ROLE_LABELS[action.role]}?</>,
      description: action.member.suspended_at
        ? `Their role changes from ${ROLE_LABELS[action.member.role]} to ${ROLE_LABELS[action.role]}. Their access stays suspended until it is restored.`
        : `Their permissions in this academy change from ${ROLE_LABELS[action.member.role]} to ${ROLE_LABELS[action.role]}.`,
      label: "Change role", pending: "Changing…", success: `Role changed to ${ROLE_LABELS[action.role]}.`, unchanged: `This member is already ${ROLE_LABELS[action.role]}.`,
      destructive: false,
    };
  }
}

function run(academyId: string, action: MemberAction) {
  const userId = action.member.user_id;
  switch (action.kind) {
    case "remove": return removeStaffMember(academyId, userId);
    case "suspend": return suspendStaffMember(academyId, userId);
    case "restore": return restoreStaffMember(academyId, userId);
    case "role": return changeStaffMemberRole(academyId, userId, action.role);
  }
}

/** The confirmed outcome, applied locally until the refetch below replaces it. */
function applied(members: TeamMember[], action: MemberAction): TeamMember[] {
  const id = action.member.user_id;
  if (action.kind === "remove") return members.filter((m) => m.user_id !== id);
  return sortTeamMembers(members.map((m) => m.user_id !== id ? m
    : action.kind === "role" ? { ...m, role: action.role }
    : { ...m, suspended_at: action.kind === "suspend" ? m.suspended_at ?? new Date().toISOString() : null }));
}

export function MemberActionDialog({ academyId, userId, action, onClose }: {
  academyId: string; userId: string; action: MemberAction | null; onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();

  // Keep the last action while the dialog animates closed so its text doesn't change mid-fade.
  const [shown, setShown] = useState(action);
  if (action && action !== shown) setShown(action);

  const copy = shown ? copyFor(shown) : null;
  const name = accountName(shown?.member.profiles) || "this member";

  async function submit() {
    if (!action || pending) return;
    const actionCopy = copyFor(action);
    setPending(true);
    try {
      const result = await run(academyId, action);
      if (!isCurrent(academyId)) return;
      if (!result.ok) { toast.error(result.message); return; }
      if (!result.unchanged) {
        queryClient.setQueryData<TeamMember[]>(staffQueryKeys.members(userId, academyId),
          (members) => members && applied([...members], action));
      }
      toast.success(result.unchanged ? actionCopy.unchanged : actionCopy.success);
      onClose();
    } catch {
      if (isCurrent(academyId)) toast.error("Couldn’t update this member. Check your connection and try again.");
    } finally {
      setPending(false);
      // The server's state is authoritative, including after a conflict or permission change.
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.members(userId, academyId) });
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.invitations(userId, academyId) });
    }
  }

  return <AlertDialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{copy?.title(<span className="font-semibold">{name}</span>)}</AlertDialogTitle>
        <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant={copy?.destructive ? "destructive" : "default"} disabled={pending} onClick={(event) => { event.preventDefault(); void submit(); }}>{pending ? copy?.pending : copy?.label}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
