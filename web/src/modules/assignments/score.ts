import { toHundredths } from "@/lib/score";

/**
 * Assignment mark limits. The exact decimal helpers are the shared contract in src/lib/score.ts.
 */
export { formatScore, fromHundredths, isValidScoreText, sumScores, toHundredths } from "@/lib/score";

export const MAX_PART_SCORE = 1000;
/** A typed part is the sum of its questions, bounded here and in the database. */
export const MAX_PART_TOTAL = 10000;

/** A question or legacy-part maximum: positive, at most 1000, at most two fractional digits. */
export function isValidMaxScore(value: string): boolean {
  const hundredths = toHundredths(value);
  return hundredths !== null && hundredths > 0 && hundredths <= MAX_PART_SCORE * 100;
}
