import { z } from "zod";

const coordinate = z.number().int().min(0).max(1000);
const bounds = z.object({ left: coordinate, top: coordinate, right: coordinate, bottom: coordinate })
  .refine(b => b.right - b.left >= 10 && b.bottom - b.top >= 10);
export const reviewedVisual = z.object({ description: z.string().trim().min(1).max(160), bounds });
export const providerVisual = reviewedVisual.omit({ bounds: true }).extend({ box_2d: z.array(coordinate).length(4) });
/** Gemini's native y/x order is converted once; browser/editor bounds remain x/y named fields. */
export function normalizeVisual(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("box_2d" in value)) return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.box_2d) || record.box_2d.length !== 4) return value;
  const [top, left, bottom, right] = record.box_2d;
  return { ...record, bounds: { top, left, bottom, right } };
}
export const scanVisualSchema = reviewedVisual.extend({ exerciseId: z.number().int().min(1).max(60) });
export const sharedInstruction = z.object({
  text: z.string().trim().min(1).max(600),
  exerciseIds: z.array(z.number().int().min(1).max(60)).min(2).max(60),
});
export const scanCandidate = z.object({
  excerpt: z.string().trim().min(1).max(600), number: z.string().trim().min(1).max(24).nullable(),
});
export const scanTranscription = z.object({
  transcript: z.string().trim().min(1).max(32000),
  exercises: z.array(z.union([z.string().trim().min(1).max(600), scanCandidate])).max(60),
  // Malformed proposals are isolated during extraction instead of losing legible text.
  visuals: z.array(z.unknown()).max(60).optional(),
  sharedInstructions: z.array(z.unknown()).max(12).optional(),
}).refine(value => JSON.stringify(value).length <= 120000);
export type ScanTranscription = z.infer<typeof scanTranscription>;
