import { cookies } from "next/headers";

import { createClient } from "../../lib/supabase/server";

import { PENDING_STAFF_INVITE_COOKIE } from "./pending";
import { isStaffInviteToken } from "./link";
import { parseJoinResponse, type StaffJoinState } from "./types";

export { PENDING_STAFF_INVITE_COOKIE, clearPendingStaffInvite, pendingStaffInviteCookie } from "./pending";
export { isStaffInviteToken } from "./link";

/** Read-only preview of the pending invitation for the signed-in account. Never consumes it. */
export async function getStaffJoinState(): Promise<StaffJoinState> {
  const token = (await cookies()).get(PENDING_STAFF_INVITE_COOKIE)?.value;
  if (!token) return { kind: "none" };
  if (!isStaffInviteToken(token)) return { kind: "unavailable" };
  const db = await createClient();
  const { data, error } = await db.rpc("preview_staff_invitation", { p_token: token });
  return error ? { kind: "error" } : verifyJoinedMembership(parseJoinResponse(data), db);
}

/** An accepted invitation is history, not authority to access a removed or suspended membership. */
export async function verifyJoinedMembership(
  state: StaffJoinState,
  db: Awaited<ReturnType<typeof createClient>>,
): Promise<StaffJoinState> {
  if (state.kind !== "accepted" && state.kind !== "joined" && state.kind !== "already_member") return state;
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError) return { kind: "error" };
  if (!user) return { kind: "unauthenticated" };
  const { data: membership, error } = await db.from("academy_memberships")
    .select("user_id").eq("academy_id", state.academy.id).eq("user_id", user.id).is("suspended_at", null).maybeSingle();
  if (error) return { kind: "error" };
  return membership ? state : { kind: "unavailable" };
}
