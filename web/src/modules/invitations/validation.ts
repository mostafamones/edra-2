import { z } from "zod";

import { phoneSchema } from "../../lib/phone";

export const staffInvitationSchema = z.object({
  phone: phoneSchema,
  role: z.enum(["admin", "instructor"]),
});

export type StaffInvitationInput = z.infer<typeof staffInvitationSchema>;
