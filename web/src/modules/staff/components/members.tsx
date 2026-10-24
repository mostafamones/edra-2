"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon, Calendar03Icon, Call02Icon, MailAdd01Icon, MoreHorizontalIcon, SecurityCheckIcon, UserBlock01Icon,
  UserCheck01Icon, UserGroupIcon, UserMinus01Icon,
} from "@hugeicons/core-free-icons";

import type { AcademyEntry } from "@/modules/academies";
import { accountName } from "@/modules/account/contract";
import { FilterPopover } from "@/components/shared/filter-popover";
import { HeaderActions } from "@/components/shared/header-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { ROLE_LABELS, formatDate } from "../format";
import { fetchAllInvitations, fetchTeamMembers, staffQueryKeys } from "../queries";
import type { InvitationRow, TeamMember } from "../types";
import { canManageMember, roleChoices } from "../permissions";
import type { InvitationStatusFilter } from "../validation";
import { CardFact } from "./fact";
import { InvitationCard } from "./invitation-card";
import { InviteDialog } from "./invite-dialog";
import { RevokeDialog } from "./revoke-dialog";
import { MemberActionDialog, type MemberAction } from "./member-dialog";

const DEFAULT_STATUS: InvitationStatusFilter = "pending";
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
  { value: "all", label: "All" },
];

const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

export function TeamMembers({ academy, userId, canManage }: {
  academy: AcademyEntry;
  userId: string;
  canManage: boolean;
}) {
  const academyId = academy.id;
  const [tab, setTab] = useState("members");
  const [status, setStatus] = useState<InvitationStatusFilter>(DEFAULT_STATUS);
  const [revoking, setRevoking] = useState<InvitationRow | null>(null);
  const [memberAction, setMemberAction] = useState<MemberAction | null>(null);
  const members = useQuery({
    queryKey: staffQueryKeys.members(userId, academyId),
    queryFn: ({ signal }) => fetchTeamMembers(academyId, signal),
    enabled: Boolean(userId),
  });
  const invitations = useQuery({
    queryKey: staffQueryKeys.invitationList(userId, academyId, status),
    queryFn: ({ signal }) => fetchAllInvitations(academyId, status, signal),
    enabled: Boolean(userId) && canManage,
  });

  const membersPanel = (
    <Panel
      query={members}
      label="team members"
      skeleton="h-32"
      empty={<EmptyState icon={UserGroupIcon} title="No team members found" />}
    >
      {(rows) => rows.map((member) => (
        <li key={member.user_id} className="min-w-0">
          <MemberCard academy={academy} userId={userId} member={member} onAction={setMemberAction} />
        </li>
      ))}
    </Panel>
  );

  return (
    <section aria-label="Team" className="space-y-5">
      {canManage && <HeaderActions><InviteDialog academy={academy} userId={userId} /></HeaderActions>}
      {canManage ? (
        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <div className="flex items-center justify-between gap-3 border-b">
            <TabsList variant="line" className="justify-start">
              <TabsTrigger value="members" className="flex-none">Members<Count value={members.data?.length} /></TabsTrigger>
              <TabsTrigger value="invitations" className="flex-none">Invitations<Count value={invitations.data?.length} /></TabsTrigger>
            </TabsList>
            {tab === "invitations" && (
              <FilterPopover iconOnly fields={[{
                id: "status", label: "Status", value: status, defaultValue: DEFAULT_STATUS, options: STATUS_OPTIONS,
                onChange: (value: string) => setStatus(value as InvitationStatusFilter),
              }]} />
            )}
          </div>
          <TabsContent value="members">{membersPanel}</TabsContent>
          <TabsContent value="invitations">
            <Panel
              query={invitations}
              label="invitations"
              skeleton="h-28"
              empty={(
                <EmptyState icon={MailAdd01Icon} title={status === "all" ? "No invitations" : `No ${status} invitations`}>
                  {status !== DEFAULT_STATUS && <Button variant="outline" size="sm" onClick={() => setStatus(DEFAULT_STATUS)}>Clear filter</Button>}
                </EmptyState>
              )}
            >
              {(rows) => rows.map((row) => (
                <li key={row.id} className="min-w-0"><InvitationCard row={row} onRevoke={setRevoking} /></li>
              ))}
            </Panel>
          </TabsContent>
        </Tabs>
      ) : membersPanel}
      <RevokeDialog academyId={academyId} userId={userId} invitation={revoking} onClose={() => setRevoking(null)} />
      <MemberActionDialog academyId={academyId} userId={userId} action={memberAction} onClose={() => setMemberAction(null)} />
    </section>
  );
}

function Count({ value }: { value: number | undefined }) {
  return value === undefined ? null : <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{value}</span>;
}

/** Loading, error and empty handling shared by both tabs; rows render as a card grid. */
function Panel<T>({ query, label, skeleton, empty, children }: {
  query: { data?: T[]; isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
  label: string;
  skeleton: string;
  empty: ReactNode;
  children: (rows: T[]) => ReactNode;
}) {
  if (query.isPending && !query.isError) {
    return (
      <div role="status" aria-label={`Loading ${label}`} className={GRID}>
        {[0, 1, 2].map((key) => <Skeleton key={key} className={`${skeleton} rounded-xl`} />)}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {query.isError && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} />
          <AlertTitle>Couldn’t load {label}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry"}</Button>
          </AlertDescription>
        </Alert>
      )}
      {query.data && (query.data.length ? <ul className={GRID}>{children(query.data)}</ul> : empty)}
    </div>
  );
}

function EmptyState({ icon, title, children }: { icon: typeof UserGroupIcon; title: string; children?: ReactNode }) {
  return (
    <Empty className="min-h-56 rounded-xl border border-dashed bg-card/20">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon icon={icon} aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

function MemberCard({ academy, userId, member, onAction }: {
  academy: AcademyEntry;
  userId: string;
  member: TeamMember;
  onAction: (action: MemberAction) => void;
}) {
  const name = accountName(member.profiles) || "Team member";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const suspended = Boolean(member.suspended_at);
  const choices = roleChoices(academy.role, member.role, userId, member.user_id);
  return (
    <Card size="sm" className="h-full gap-4 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Avatar size="lg" aria-hidden="true" className={suspended ? "opacity-50 grayscale" : undefined}>
          <AvatarImage src={member.avatarUrl} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="truncate font-medium text-foreground">
            {name}{member.user_id === userId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">You</span>}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={member.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[member.role]}</Badge>
            {suspended && <Badge variant="destructive">Suspended</Badge>}
          </div>
        </div>
        {canManageMember(academy.role, member.role, userId, member.user_id) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 -mt-1 text-muted-foreground" aria-label={`Actions for ${name}`}>
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit">
              {choices.length > 0 && <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><HugeiconsIcon icon={SecurityCheckIcon} />Change role</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {choices.map((role) => <DropdownMenuItem key={role} onSelect={() => onAction({ member, kind: "role", role })}>{ROLE_LABELS[role]}</DropdownMenuItem>)}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
              </>}
              {suspended
                ? <DropdownMenuItem onSelect={() => onAction({ member, kind: "restore" })}><HugeiconsIcon icon={UserCheck01Icon} />Restore access</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => onAction({ member, kind: "suspend" })}><HugeiconsIcon icon={UserBlock01Icon} />Suspend access</DropdownMenuItem>}
              <DropdownMenuItem variant="destructive" onSelect={() => onAction({ member, kind: "remove" })}><HugeiconsIcon icon={UserMinus01Icon} />Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <dl className="mt-auto grid gap-1.5 text-xs text-muted-foreground">
        <CardFact icon={Call02Icon} label="Phone">
          {member.profiles.phone ? <span dir="ltr" className="tabular-nums">{member.profiles.phone}</span> : "No phone"}
        </CardFact>
        <CardFact icon={Calendar03Icon} label="Joined">Joined {formatDate(member.created_at)}</CardFact>
        {member.suspended_at && (
          <CardFact icon={UserBlock01Icon} label="Suspended" className="text-destructive">Suspended {formatDate(member.suspended_at)}</CardFact>
        )}
      </dl>
    </Card>
  );
}
