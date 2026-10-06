"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconCalendar, IconDots, IconPhone, IconShieldCheck, IconUserMinus, IconUsers } from "@tabler/icons-react";

import type { AcademyEntry } from "@/modules/academies";
import { FilterPopover } from "@/components/shared/filter-popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { ROLE_LABELS, formatDate } from "../format";
import { fetchAllInvitations, fetchTeamMembers, staffQueryKeys } from "../queries";
import type { InvitationRow } from "../types";
import { canDemoteMember, canPromoteMember, canRemoveMember } from "../permissions";
import type { InvitationStatusFilter } from "../validation";
import { InvitationCard } from "./invitation-card";
import { InviteDialog } from "./invite-dialog";
import { RevokeDialog } from "./revoke-dialog";
import { MemberActionDialog, type MemberAction } from "./member-dialog";

type TeamFilter = "team" | InvitationStatusFilter;
const DEFAULT_STATUS: TeamFilter = "team";
const STATUS_OPTIONS = [
  { value: "team", label: "Team & pending invites" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
  { value: "all", label: "All invitations" },
];

export function TeamMembers({ academy, userId, canManage }: {
  academy: AcademyEntry;
  userId: string;
  canManage: boolean;
}) {
  const academyId = academy.id;
  const [status, setStatus] = useState<TeamFilter>(DEFAULT_STATUS);
  const invitationStatus = status === "team" ? "pending" : status;
  const showMembers = status === "team" || !canManage;
  const [revoking, setRevoking] = useState<InvitationRow | null>(null);
  const [memberAction, setMemberAction] = useState<MemberAction | null>(null);
  const invitations = useQuery({
    queryKey: staffQueryKeys.invitationList(userId, academyId, invitationStatus),
    queryFn: ({ signal }) => fetchAllInvitations(academyId, invitationStatus, signal),
    enabled: Boolean(userId) && canManage,
  });
  const invitationRows = canManage ? invitations.data ?? [] : [];
  const query = useQuery({
    queryKey: staffQueryKeys.members(userId, academyId),
    queryFn: ({ signal }) => fetchTeamMembers(academyId, signal),
    enabled: Boolean(userId),
  });
  const members = showMembers ? query.data ?? [] : [];
  const loading = (showMembers && query.isPending) || (canManage && invitations.isPending);
  const loadFailed = (showMembers && query.isError) || (canManage && invitations.isError);
  const emptyTitle = showMembers ? "No team members found"
    : status === "all" ? "No invitations found" : `No ${status} invitations`;

  return (
    <section aria-labelledby="team-members-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="team-members-heading" className="font-heading text-lg font-semibold">
          {showMembers ? "Members" : "Invitations"}
          {(showMembers ? query.data : invitations.data) ? <span className="ml-2 text-sm font-normal text-muted-foreground">{showMembers ? members.length : invitationRows.length}</span> : null}
        </h2>
        {canManage && <div className="flex items-center gap-2">
          <FilterPopover iconOnly fields={[{
            id: "status", label: "Show", value: status, defaultValue: DEFAULT_STATUS, options: STATUS_OPTIONS,
            onChange: (value: string) => setStatus(value as TeamFilter),
          }]} />
          <InviteDialog academy={academy} userId={userId} />
        </div>}
      </div>
      {loadFailed && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{showMembers ? "Couldn’t load team members" : "Couldn’t load invitations"}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => { void query.refetch(); void invitations.refetch(); }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <div role="status" aria-label={showMembers ? "Loading team members" : "Loading invitations"} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-40 rounded-xl" />)}
        </div>
      ) : loadFailed && members.length === 0 && invitationRows.length === 0 ? null : members.length === 0 && invitationRows.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconUsers aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{showMembers ? "Members of this academy will appear here." : "Try another status or clear the filter."}</EmptyDescription>
          </EmptyHeader>
          {!showMembers && <Button variant="outline" size="sm" onClick={() => setStatus(DEFAULT_STATUS)}>Clear filter</Button>}
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => {
            const name = member.profiles.full_name?.trim() || "Team member";
            const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
            return (
              <li key={member.user_id} className="min-w-0">
                <Card size="sm" className="h-full gap-0 rounded-lg py-0 transition-colors hover:bg-muted/30">
                  <div className="flex h-20 items-center gap-3 px-4">
                    <Avatar size="lg" aria-hidden="true"><AvatarFallback>{initials}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 dir="auto" className="truncate font-medium text-foreground">
                        {name}{member.user_id === userId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">You</span>}
                      </h3>
                    </div>
                    <Badge variant={member.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[member.role]}</Badge>
                    {canRemoveMember(academy.role, member.role, userId, member.user_id) && <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="-mr-1.5 text-muted-foreground" aria-label={`Actions for ${name}`}><IconDots /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canPromoteMember(academy.role, member.role, userId, member.user_id) && <DropdownMenuItem onSelect={() => setMemberAction({ member, kind: "promote" })}><IconShieldCheck />Promote</DropdownMenuItem>}
                        {canDemoteMember(academy.role, member.role, userId, member.user_id) && <DropdownMenuItem onSelect={() => setMemberAction({ member, kind: "demote" })}><IconShieldCheck />Demote</DropdownMenuItem>}
                        <DropdownMenuItem className="text-destructive! hover:text-destructive! focus:text-destructive! data-highlighted:text-destructive! **:text-destructive! hover:**:text-destructive! focus:**:text-destructive! data-highlighted:**:text-destructive!" onSelect={() => setMemberAction({ member, kind: "remove" })}><IconUserMinus />Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  </div>
                  <div className="mt-auto space-y-1.5 border-t px-4 py-3 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <IconPhone className="size-3.5 shrink-0" aria-hidden="true" />
                      {member.profiles.phone ? <span dir="ltr" className="tabular-nums">{member.profiles.phone}</span> : "No phone"}
                    </p>
                    <p className="flex items-center gap-2">
                      <IconCalendar className="size-3.5 shrink-0" aria-hidden="true" />
                      Joined {formatDate(member.created_at)}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
          {invitationRows.map((row) => (
            <li key={row.id} className="min-w-0">
              <InvitationCard row={row} onRevoke={setRevoking} />
            </li>
          ))}
        </ul>
      )}
      <RevokeDialog academyId={academyId} userId={userId} invitation={revoking} onClose={() => setRevoking(null)} />
      <MemberActionDialog academyId={academyId} userId={userId} action={memberAction} onClose={() => setMemberAction(null)} />
    </section>
  );
}
