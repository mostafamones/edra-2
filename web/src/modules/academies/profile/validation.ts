import { z } from "zod";

import { normalizeEgyptianPhone } from "@/lib/phone";

import { ACADEMY_ICON_IDS } from "../validation";

/** Optional Egyptian mobile number: blank clears it, anything else must normalize. Not verified. */
const contactSchema = z.string().trim().nullable().transform((value, context) => {
  if (!value) return null;
  const normalized = normalizeEgyptianPhone(value);
  if (!normalized) {
    context.addIssue({ code: "custom", message: "Enter a valid Egyptian mobile number" });
    return z.NEVER;
  }
  return normalized;
});

/** The five editable fields; unknown keys (slug, id, timestamps) are rejected, not ignored. Limits match the database. */
export const academyProfileSchema = z.strictObject({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(100, "Use 100 characters or fewer"),
  icon: z.enum(ACADEMY_ICON_IDS, "Choose an icon"),
  subject: z.string().trim().min(1, "Enter a subject").max(60, "Use 60 characters or fewer"),
  phone: contactSchema,
  whatsapp: contactSchema,
});

export type AcademyProfileFields = z.input<typeof academyProfileSchema>;
export type AcademyProfileInput = z.output<typeof academyProfileSchema>;

export type AcademyProfile = AcademyProfileInput & {
  id: string;
  slug: string;
  /** Compare-and-update baseline for the next save. */
  updatedAt: string;
  canEdit: boolean;
};

export function sameProfileValues(a: AcademyProfileInput, b: AcademyProfileInput) {
  return a.name === b.name && a.icon === b.icon && a.subject === b.subject && a.phone === b.phone && a.whatsapp === b.whatsapp;
}
