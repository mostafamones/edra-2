/**
 * Exact decimal marks. Marks travel as strings with at most two fractional digits and are added in
 * integer hundredths, so totals never pick up floating-point error. Unsupported precision is
 * rejected rather than rounded.
 */

export const MAX_PART_SCORE = 1000;
/** A typed part is the sum of its questions, bounded here and in the database. */
export const MAX_PART_TOTAL = 10000;
const SCORE_PATTERN = /^\d{1,5}(?:\.\d{1,2})?$/;

/** The value in hundredths, or null when it is not a plain decimal with at most two fractional digits. */
export function toHundredths(value: string): number | null {
  const text = value.trim();
  if (!SCORE_PATTERN.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Canonical display text: no trailing fractional zeros ("12.50" → "12.5", "10.00" → "10"). */
export function fromHundredths(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** A question or legacy-part maximum: positive, at most 1000, at most two fractional digits. */
export function isValidMaxScore(value: string): boolean {
  const hundredths = toHundredths(value);
  return hundredths !== null && hundredths > 0 && hundredths <= MAX_PART_SCORE * 100;
}

/** The exact sum of valid decimal strings, or null if any is invalid. */
export function sumScores(values: readonly string[]): string | null {
  let total = 0;
  for (const value of values) {
    const hundredths = toHundredths(value);
    if (hundredths === null) return null;
    total += hundredths;
  }
  return fromHundredths(total);
}

/** Normalizes a stored decimal ("25.00") for display ("25"). Unparseable values are shown as given. */
export function formatScore(value: string | number): string {
  const hundredths = toHundredths(typeof value === "number" ? value.toFixed(2) : value);
  return hundredths === null ? String(value) : fromHundredths(hundredths);
}

/** A mark for a part: from 0 up to the part's maximum, with at most two fractional digits. */
export function isValidScoreText(value: string, max: string): boolean {
  const hundredths = toHundredths(value);
  const limit = toHundredths(max);
  return hundredths !== null && limit !== null && hundredths <= limit;
}
