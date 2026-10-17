/**
 * Assignment mark limits. The exact decimal helpers are the shared contract in src/lib/score.ts.
 */
export { formatScore, fromHundredths, isValidMaxScore, isValidScoreText, sumScores, toHundredths } from "@/lib/score";

export const MAX_PART_SCORE = 1000;
/** A typed part is the sum of its questions, bounded here and in the database. */
export const MAX_PART_TOTAL = 10000;
