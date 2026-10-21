import { z } from "zod";

import { academyRoleSchema } from "@/modules/academies/roles";

/** Roles an invitation can carry. Ownership is never invited. */
export const invitationRoleSchema = z.enum(["head_admin", "admin", "instructor"]);
const roleSchema = invitationRoleSchema;

export const teamMemberRowsSchema = z.array(z.object({
  user_id: z.guid(),
  role: academyRoleSchema,
  created_at: z.string(),
  /** Set while the member's access to this academy is suspended; the role is retained. */
  suspended_at: z.string().nullable(),
  profiles: z.object({ full_name: z.string().nullable(), display_name: z.string().nullable(), phone: z.string().nullable() }),
}));

export type TeamMember = z.infer<typeof teamMemberRowsSchema>[number];

export const invitationRowSchema = z.object({
  id: z.guid(),
  phone: z.string(),
  role: roleSchema,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdByName: z.string().nullable(),
  acceptedByName: z.string().nullable(),
  revokedByName: z.string().nullable(),
  canManage: z.boolean(),
  invitationLink: z.string().nullable().optional(),
});

export const invitationPageSchema = z.object({ rows: z.array(invitationRowSchema), total: z.number() });

export type InvitationRow = z.infer<typeof invitationRowSchema>;
export type InvitationPage = z.infer<typeof invitationPageSchema>;

/** Returned once to the manager who created the invitation, or to a permitted manager copying it. */
export type CreatedInvitation = {
  id: string;
  phone: string;
  role: z.infer<typeof roleSchema>;
  expiresAt: string;
  link: string;
};

const joinAcademySchema = z.object({ id: z.guid(), name: z.string(), slug: z.string(), icon: z.string() });

const detailedJoinSchema = z.object({
  result: z.enum(["valid", "joined", "accepted", "already_member", "revoked", "expired", "inviter_unavailable"]),
  role: roleSchema,
  expiresAt: z.string(),
  academy: joinAcademySchema,
});

const plainJoinSchema = z.object({
  result: z.enum(["unavailable", "unverified", "wrong_account", "rate_limited", "unauthenticated"]),
});

/** What the join screen may show. Academy details exist only for the invited, verified account. */
export type StaffJoinState =
  | { kind: "none" }
  | { kind: "error" }
  | { kind: z.infer<typeof plainJoinSchema>["result"] }
  | {
    kind: z.infer<typeof detailedJoinSchema>["result"];
    role: z.infer<typeof roleSchema>;
    expiresAt: string;
    academy: z.infer<typeof joinAcademySchema>;
  };

export function parseJoinResponse(value: unknown): StaffJoinState {
  const detailed = detailedJoinSchema.safeParse(value);
  if (detailed.success) {
    const { result, ...rest } = detailed.data;
    return { kind: result, ...rest };
  }
  const plain = plainJoinSchema.safeParse(value);
  return plain.success ? { kind: plain.data.result } : { kind: "error" };
}

/** States after which the pending invitation cannot lead anywhere for this account. */
export function isTerminalJoinState(state: StaffJoinState) {
  return ["joined", "accepted", "already_member", "revoked", "expired", "inviter_unavailable", "unavailable"].includes(state.kind);
}
