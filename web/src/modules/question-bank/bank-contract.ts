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

export const collectionName = z.string().trim().min(1).max(120);
export const documentName = z.string().trim().min(1).max(255);
const sectionRef = z.object({ name: z.string().trim().min(1).max(150), firstPage: z.number().int().positive(), continues: z.boolean() });
export const saveBankInput = z.object({
  academyId: z.guid(),
  programId: z.guid().nullable(),
  // Stable identity chosen at import; it never derives from the filename.
  document: z.object({ id: z.guid(), name: documentName }),
  collectionId: z.guid().nullable(),
  questions: z.array(z.object({
    id: z.guid(), unitId: z.guid().nullable(), payload: bankPayload,
    topics: z.array(collectionName).max(12), section: sectionRef.nullable(),
  }).refine(q => !q.section || q.section.firstPage <= q.payload.source.page)).min(1).max(maxSaveCount),
}).refine(input => (input.programId || input.questions.every(q => !q.unitId)) &&
  new Set(input.questions.map(q => q.id)).size === input.questions.length);

export const collectionKinds = ["topic", "source_document", "source_section", "custom"] as const;
export type CollectionKind = typeof collectionKinds[number];
export const collectionsSchema = z.object({
  total: z.number(),
  archived: z.number(),
  collections: z.array(z.object({
    id: z.guid(), kind: z.enum(collectionKinds), name: z.string(), parentId: z.guid().nullable(), firstPage: z.number().nullable(), count: z.number(),
  })),
});
export const pageSize = 24;
export const bankPageSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.guid(), unitId: z.guid().nullable(), prompt: z.string().nullable().transform(v => v ?? ""), printedNumber: z.string().nullable(),
    file: z.string().nullable(), page: z.number().nullable(), choice: z.boolean(),
    answered: z.boolean(), figures: z.boolean(), collections: z.array(z.guid()),
  })),
});
export const bankDetailSchema = z.object({ id: z.guid(), unitId: z.guid().nullable(), payload: bankPayload, archived: z.boolean(), collections: z.array(z.guid()) });
export const bankFilters = z.object({
  collectionId: z.guid().nullable(), query: z.string().max(200), offset: z.number().int().min(0).max(100_000), archived: z.boolean(),
});
/** The editable parts of a saved question; choice keys, source evidence and visuals are fixed. */
export const questionEdit = z.object({
  prompt: bankPayload.shape.prompt,
  choices: bankPayload.shape.choices,
  answer: bankPayload.shape.answer,
  modelAnswer: z.string().trim().max(10_000),
}).refine(q => (!q.answer || q.choices.some(c => c.key === q.answer)) && (!q.modelAnswer || !q.choices.length));
export const questionIds = z.array(z.guid()).min(1).max(100);

export const catalogSchema = z.array(z.object({
  id: z.guid(), year: z.number(), grade: z.string(), track: z.string().nullable(),
  units: z.array(z.object({ id: z.guid(), title: z.string(), state: z.enum(["draft", "review", "published"]), labels: z.array(z.string()) })),
}));
export type BankPayload = z.infer<typeof bankPayload>;
export type SaveBankInput = z.infer<typeof saveBankInput>;
export type BankProgram = z.infer<typeof catalogSchema>[number];
export type BankUnit = BankProgram["units"][number];
export type BankSummary = z.infer<typeof bankPageSchema>["rows"][number];
export type BankPage = z.infer<typeof bankPageSchema>;
export type BankDetail = z.infer<typeof bankDetailSchema>;
export type BankCollections = z.infer<typeof collectionsSchema>;
export type BankCollection = BankCollections["collections"][number];
export type BankFilters = z.infer<typeof bankFilters>;
export type QuestionEdit = z.infer<typeof questionEdit>;
export type BankResult<T> = { ok: true; data: T } | { ok: false; message: string };
