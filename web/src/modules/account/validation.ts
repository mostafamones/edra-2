import { z } from "zod";

/** Matches annual student record names, so a valid display name never blocks new enrollment. */
export const NAME_MAX_LENGTH = 200;

const normalized = z.string().transform((value) => value.trim().replace(/\s+/gu, " "));

export const profileSchema = z.strictObject({
  fullName: normalized.pipe(z.string().min(1, "Full name is required").max(NAME_MAX_LENGTH, `Use at most ${NAME_MAX_LENGTH} characters`)),
  /** Blank means no display name: readers fall back to the full name. */
  displayName: normalized.nullable()
    .pipe(z.string().max(NAME_MAX_LENGTH, `Use at most ${NAME_MAX_LENGTH} characters`).nullable())
    .transform((value) => value || null),
});

export type ProfileFields = z.input<typeof profileSchema>;
export type ProfileInput = z.output<typeof profileSchema>;

/** The name to show for an account: its display name, else its full name. */
export function accountName(profile: { full_name: string | null; display_name: string | null } | null | undefined) {
  return profile?.display_name?.trim() || profile?.full_name?.trim() || null;
}
