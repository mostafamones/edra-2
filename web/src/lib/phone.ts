import { z } from "zod";

const EGYPTIAN_MOBILE_PATTERN = /^\+201[0125]\d{8}$/;

export function normalizeEgyptianPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");

  let national = compact;
  if (national.startsWith("0020")) national = national.slice(4);
  else if (national.startsWith("+20")) national = national.slice(3);
  else if (national.startsWith("20")) national = national.slice(2);

  if (national.startsWith("0")) national = national.slice(1);

  const normalized = `+20${national}`;
  return EGYPTIAN_MOBILE_PATTERN.test(normalized) ? normalized : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((value, context) => {
    const normalized = normalizeEgyptianPhone(value);
    if (!normalized) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Egyptian mobile number",
      });
      return z.NEVER;
    }
    return normalized;
  });
