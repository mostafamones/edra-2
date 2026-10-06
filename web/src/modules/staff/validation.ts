import { z } from "zod";

import { phoneSchema } from "../../lib/phone";

export const staffInvitationSchema = z.object({
  phone: phoneSchema,
  role: z.enum(["admin", "instructor"]),
});

export const createStaffInvitationSchema = staffInvitationSchema.extend({ academyId: z.uuid() });

export const invitationStatusFilterSchema = z.enum(["pending", "accepted", "revoked", "expired", "all"]);

export type StaffInvitationInput = z.infer<typeof staffInvitationSchema>;
export type InvitationStatusFilter = z.infer<typeof invitationStatusFilterSchema>;
