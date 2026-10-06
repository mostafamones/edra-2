const PHONE_CODE_METHODS = new Set(["otp", "recovery", "magiclink"]);

/**
 * True when verified JWT claims come from a phone-code sign-in (password recovery or a direct
 * verifyOtp call). Such sessions may only set a new password: the database rejects them for every
 * application operation, so the app treats them as signed out. Missing `amr` is treated the same.
 */
export function isPhoneCodeSession(claims: { amr?: unknown } | null | undefined): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return true;
  return amr.some((entry) => PHONE_CODE_METHODS.has((entry as { method?: unknown } | null)?.method as string));
}
