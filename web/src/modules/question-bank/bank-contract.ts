import { z } from "zod";

export const maxSaveCount = 30;
export const maxSaveBytes = 750_000;
const coordinate = z.number().min(0).max(1);
const visual = z.object({
  description: z.string().trim().min(1).max(250),
  page: z.number().int().positive(),
  bounds: z.object({ top: coordinate, bottom: coordinate, left: coordinate, right: coordinate }).refine(b => b.top < b.bottom && b.left < b.right),
  image: z.string().max(maxSaveBytes).regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/u),
});
export const bankPayload = z.object({
  prompt: z.string().trim().min(1).max(10_000),
  choices: z.array(z.object({ key: z.string().min(1).max(8), text: z.string().trim().min(1).max(2000) })).max(12),
  answer: z.string().min(1).max(8).nullable(),
  answerSource: z.object({ file: z.string().min(1).max(255), page: z.number().int().positive() }).optional(),
  modelAnswer: z.string().trim().min(1).max(10_000).optional(),
  topic: z.string().trim().min(1).max(120).nullable(),
  section: z.string().max(150).nullable(),
  printedNumber: z.string().min(1).max(40),
  source: z.object({ file: z.string().min(1).max(255), page: z.number().int().positive(), continuationPages: z.array(z.number().int().positive()).max(24) }),
  visuals: z.array(visual).max(12),
}).refine(q => (!q.answer || q.choices.some(c => c.key === q.answer)) && (!q.modelAnswer || !q.choices.length));

export const saveBankInput = z.object({
  academyId: z.guid(),
  programId: z.guid().nullable(),
  questions: z.array(z.object({ id: z.guid(), unitId: z.guid().nullable(), payload: bankPayload })).min(1).max(maxSaveCount),
}).refine(input => (input.programId || input.questions.every(q => !q.unitId)) &&
  new Set(input.questions.map(q => q.id)).size === input.questions.length);

export const catalogSchema = z.array(z.object({
  id: z.guid(), year: z.number(), grade: z.string(), track: z.string().nullable(),
  units: z.array(z.object({ id: z.guid(), title: z.string(), state: z.enum(["draft", "review", "published"]), labels: z.array(z.string()) })),
}));
export type BankPayload = z.infer<typeof bankPayload>;
export type SaveBankInput = z.infer<typeof saveBankInput>;
export type BankProgram = z.infer<typeof catalogSchema>[number];
export type BankUnit = BankProgram["units"][number];
export type BankSummary = { id: string; prompt: string; topic: string | null; unitId: string | null };
export type BankResult<T> = { ok: true; data: T } | { ok: false; message: string };
