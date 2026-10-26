import { z } from "zod";

// Persisted PostgreSQL UUIDs include deterministic dev fixtures without RFC version/variant bits.
export const targetSchema = z.object({ academyId: z.guid(), sessionId: z.guid() });
export const selectionSchema = z.object({ unitId: z.guid(), revision: z.number().int().positive() }).strict();
export const taughtItemSchema = selectionSchema.extend({ title: z.string() });
export const taughtSheetSchema = z.object({
  revision: z.number().int().nonnegative(),
  lockReason: z.enum(["archived", "year_closed", "finalized"]).nullable(),
  items: z.array(taughtItemSchema),
  history: z.array(z.object({ revision: z.number().int().positive(), savedAt: z.string(), savedBy: z.string().nullable(), titles: z.array(z.string()) })),
});
export const saveTaughtSchema = targetSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
  items: z.array(selectionSchema).max(200).refine(items => new Set(items.map(i => i.unitId)).size === items.length),
  key: z.uuid(),
});
export const taughtResultSchema = z.object({ outcome: z.enum(["saved", "unchanged"]), revision: z.number().int().nonnegative(), replayed: z.boolean() });
export type TaughtItem = z.infer<typeof taughtItemSchema>;
export type TaughtSheet = z.infer<typeof taughtSheetSchema>;
export type TaughtTarget = z.infer<typeof targetSchema>;
export type SaveTaughtInput = z.infer<typeof saveTaughtSchema>;

export const LOCK_LABELS = { archived: "Archived session · read-only", year_closed: "Closed academic year · read-only", finalized: "Attendance finalized · units locked" };
export function selection(items: TaughtItem[]) { return items.map(({ unitId, revision }) => ({ unitId, revision })); }
export function sameSelection(a: TaughtItem[], b: TaughtItem[]) { return JSON.stringify(selection(a)) === JSON.stringify(selection(b)); }
export const taughtRootKey = (academyId: string, sessionId: string) => ["content", "taught", academyId, sessionId] as const;
export const taughtQueryKey = (userId: string, academyId: string, sessionId: string) => [...taughtRootKey(academyId, sessionId), userId] as const;
