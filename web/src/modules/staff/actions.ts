"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { createClient } from "../../lib/supabase/server";

import { parseStaffInviteLink } from "./link";
import { PENDING_STAFF_INVITE_COOKIE, pendingStaffInviteCookie } from "./pending";
import { appOrigin, decryptInviteToken, encryptInviteToken, generateInviteToken, staffInviteLink } from "./secret";
import { getStaffJoinState, verifyJoinedMembership } from "./server";
import { isTerminalJoinState, parseJoinResponse, type CreatedInvitation, type StaffJoinState } from "./types";
import { createStaffInvitationSchema } from "./validation";

type Failure = { ok: false; message: string };

export async function changeStaffMemberRole(academyId: string, userId: string, role: "admin" | "instructor"): Promise<{ ok: true } | Failure> {
  if (!z.uuid().safeParse(academyId).success || !z.uuid().safeParse(userId).success || !z.enum(["admin", "instructor"]).safeParse(role).success) {
    return { ok: false, message: "Invalid member." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("change_staff_member_role", { p_academy_id: academyId, p_user_id: userId, p_role: role });
  const result = (data as { result?: string } | null)?.result;
  if (!error && (result === "role_changed" || result === "unchanged")) return { ok: true };
  return { ok: false, message: result === "forbidden"
    ? "Only the academy owner can change staff roles."
    : result === "not_found" ? "This member no longer belongs to the academy."
    : "Couldn’t change this member’s role. Please try again." };
}

export async function removeStaffMember(academyId: string, userId: string): Promise<{ ok: true } | Failure> {
  if (!z.uuid().safeParse(academyId).success || !z.uuid().safeParse(userId).success) {
    return { ok: false, message: "Invalid member." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("remove_staff_member", { p_academy_id: academyId, p_user_id: userId });
  const result = (data as { result?: string } | null)?.result;
  if (!error && (result === "removed" || result === "not_found")) return { ok: true };
  return { ok: false, message: result === "forbidden"
    ? "You don’t have permission to remove this member."
    : "Couldn’t remove this member. Please try again." };
}

const CREATE_MESSAGES: Record<string, string> = {
  forbidden: "You don’t have permission to invite this role in this academy.",
  invalid_phone: "Enter a valid Egyptian mobile number.",
  pending_exists: "This number already has a pending invitation. Revoke it before sending a new one.",
  already_member: "This number already belongs to a member of this academy.",
  rate_limited: "Too many invitations were created recently. Try again later.",
};

const REVOKE_MESSAGES: Record<string, string> = {
  forbidden: "You don’t have permission to revoke this invitation.",
  not_found: "This invitation no longer exists in this academy.",
  already_accepted: "This invitation was already accepted. Revoking it would not remove the membership.",
  expired: "This invitation had already expired.",
};

const createdSchema = z.object({
  result: z.literal("created"),
  invitation: z.object({ id: z.uuid(), phone: z.string(), role: z.enum(["admin", "instructor"]), expiresAt: z.string() }),
});

const uuid = z.uuid();

function encryptOrNull(token: string, academyId: string) {
  try {
    return encryptInviteToken(token, academyId);
  } catch (error) {
    console.error("Staff invitation links are not configured", error);
    return null;
  }
}

export async function createStaffInvitation(value: unknown): Promise<{ ok: true; invitation: CreatedInvitation } | Failure> {
  const parsed = createStaffInvitationSchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: "Check the phone number and role." };
  const { academyId, phone, role } = parsed.data;

  const token = generateInviteToken();
  const ciphertext = encryptOrNull(token, academyId);
  if (!ciphertext) return { ok: false, message: "Invitations aren’t available right now." };

  const db = await createClient();
  const { data, error } = await db.rpc("create_staff_invitation", {
    p_academy_id: academyId, p_phone: phone, p_role: role, p_token: token, p_token_ciphertext: ciphertext,
  });
  if (error) return { ok: false, message: "The invitation couldn’t be created. Try again." };

  const created = createdSchema.safeParse(data);
  if (!created.success) {
    const code = (data as { result?: string } | null)?.result ?? "";
    return { ok: false, message: CREATE_MESSAGES[code] ?? "The invitation couldn’t be created. Try again." };
  }
  return { ok: true, invitation: { ...created.data.invitation, link: staffInviteLink(token) } };
}

export async function revokeStaffInvitation(academyId: string, invitationId: string): Promise<{ ok: true } | Failure> {
  if (!uuid.safeParse(academyId).success || !uuid.safeParse(invitationId).success) {
    return { ok: false, message: "Invalid invitation." };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("revoke_staff_invitation", { p_academy_id: academyId, p_invitation_id: invitationId });
  if (error) return { ok: false, message: "The invitation couldn’t be revoked. Try again." };
  const code = (data as { result?: string } | null)?.result ?? "";
  if (code === "revoked") return { ok: true };
  return { ok: false, message: REVOKE_MESSAGES[code] ?? "The invitation couldn’t be revoked. Try again." };
}

/** Loads copy links with the invitations list for managers who can manage each invitation. */
export async function getStaffInvitationLinks(academyId: string, invitationIds: string[]): Promise<{ ok: true; links: Record<string, string | null> } | Failure> {
  if (!uuid.safeParse(academyId).success || !z.array(z.uuid()).max(1000).safeParse(invitationIds).success) {
    return { ok: false, message: "Invalid invitation." };
  }
  const db = await createClient();
  const links = await Promise.all(invitationIds.map(async (invitationId) => {
    const { data, error } = await db.rpc("staff_invitation_link_ciphertext", { p_academy_id: academyId, p_invitation_id: invitationId });
    const result = data as { result?: string; ciphertext?: string } | null;
    const token = !error && result?.result === "ok" && result.ciphertext
      ? decryptInviteToken(result.ciphertext, academyId)
      : null;
    return [invitationId, token ? staffInviteLink(token) : null] as const;
  }));
  return { ok: true, links: Object.fromEntries(links) };
}

/** Previews the current invitation and removes pending context after a definitive outcome. */
export async function previewStaffInvitation(): Promise<StaffJoinState> {
  const state = await getStaffJoinState();
  if (isTerminalJoinState(state)) await clearStaffInvitation();
  return state;
}

/** Previews a pasted link or token. Joining still requires explicit confirmation. */
export async function openStaffInvitationLink(value: unknown): Promise<{ ok: true; state: StaffJoinState } | Failure> {
  const token = typeof value === "string" ? parseStaffInviteLink(value, appOrigin()) : null;
  if (!token) return { ok: false, message: "Enter a valid invitation link or token." };
  (await cookies()).set(PENDING_STAFF_INVITE_COOKIE, token, pendingStaffInviteCookie);
  return { ok: true, state: await previewStaffInvitation() };
}

export async function clearStaffInvitation() {
  (await cookies()).delete({ name: PENDING_STAFF_INVITE_COOKIE, path: "/" });
}

/** Explicit acceptance. The database re-checks phone, state, expiry, and inviter authority under lock. */
export async function acceptStaffInvitation(): Promise<StaffJoinState> {
  const store = await cookies();
  const token = store.get(PENDING_STAFF_INVITE_COOKIE)?.value;
  if (!token) return { kind: "none" };

  const db = await createClient();
  const { data, error } = await db.rpc("accept_staff_invitation", { p_token: token });
  if (error) return { kind: "error" };

  const state = await verifyJoinedMembership(parseJoinResponse(data), db);
  if (isTerminalJoinState(state)) store.delete({ name: PENDING_STAFF_INVITE_COOKIE, path: "/" });
  return state;
}
