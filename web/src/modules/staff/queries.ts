import { createClient } from "../../lib/supabase/client";
import { academyRoleRank } from "@/modules/academies/roles";
import { accountName } from "@/modules/account/contract";

import { getStaffInvitationLinks } from "./actions";
import { invitationPageSchema, teamMemberRowsSchema, type TeamMember } from "./types";
import type { InvitationStatusFilter } from "./validation";

export const INVITATION_PAGE_SIZE = 20;

// Keyed by account and academy so a late response can never fill another academy's or account's view.
export const staffQueryKeys = {
  members: (userId: string, academyId: string) => ["staff", userId, academyId, "members"] as const,
  invitations: (userId: string, academyId: string) => ["staff", userId, academyId, "invitations"] as const,
  invitationList: (userId: string, academyId: string, status: InvitationStatusFilter) =>
    [...staffQueryKeys.invitations(userId, academyId), "list", status] as const,
  invitationPage: (userId: string, academyId: string, status: InvitationStatusFilter, page: number) =>
    [...staffQueryKeys.invitations(userId, academyId), status, page] as const,
};

/**
 * Uses the signed-in client: membership and profile RLS enforce academy visibility. Suspended
 * members stay listed for active staff; a suspended caller sees nothing in this academy.
 */
export async function fetchTeamMembers(academyId: string, signal?: AbortSignal): Promise<TeamMember[]> {
  const members: TeamMember[] = [];
  const batchSize = 500;
  // Read every page so the Data API's row limit cannot silently hide part of the team.
  for (let offset = 0; ; offset += batchSize) {
    let request = createClient().from("academy_memberships")
      .select("user_id, role, created_at, suspended_at, profiles!academy_memberships_user_id_fkey(full_name, display_name, phone)")
      .eq("academy_id", academyId)
      .order("user_id")
      .range(offset, offset + batchSize - 1);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    const rows = teamMemberRowsSchema.parse(data ?? []);
    members.push(...rows);
    if (rows.length < batchSize) break;
  }
  return sortTeamMembers(members);
}

/** Owner first, then Head Admins, Admins and Instructors, each by name. */
export function sortTeamMembers(members: TeamMember[]) {
  return members.sort((a, b) => academyRoleRank(a.role) - academyRoleRank(b.role)
    || (accountName(a.profiles) ?? "").localeCompare(accountName(b.profiles) ?? "")
    || a.user_id.localeCompare(b.user_id));
}

export async function fetchInvitations(academyId: string, status: InvitationStatusFilter, page: number, signal?: AbortSignal) {
  let request = createClient().rpc("list_staff_invitations", {
    p_academy_id: academyId,
    // SQL null means every status; the generated type does not model nullable arguments.
    p_status: (status === "all" ? null : status) as string,
    p_page_index: page,
    p_page_size: INVITATION_PAGE_SIZE,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return invitationPageSchema.parse(data);
}

/** Every invitation with the status, read page by page so none is hidden from the team view. */
export async function fetchAllInvitations(academyId: string, status: InvitationStatusFilter, signal?: AbortSignal) {
  const first = await fetchInvitations(academyId, status, 0, signal);
  const rows = [...first.rows];
  for (let page = 1; rows.length < first.total; page++) {
    const next = await fetchInvitations(academyId, status, page, signal);
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
  }
  rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const linkIds = rows.filter((row) => row.status === "pending" && row.canManage).map((row) => row.id);
  if (linkIds.length === 0) return rows;
  let links: Record<string, string | null> = {};
  try {
    const result = await getStaffInvitationLinks(academyId, linkIds);
    if (result.ok) links = result.links;
  } catch {
    // Keep the invitation cards visible if link preloading fails; Copy reports the recovery step.
  }
  return rows.map((row) => ({ ...row, invitationLink: links[row.id] ?? null }));
}
