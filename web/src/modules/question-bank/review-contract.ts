import { z } from "zod";
import { maxBookPages } from "./import-limits";
import { reviewedVisual, scanTranscription } from "./scan-contract";
export { reviewedVisual } from "./scan-contract";

export const pageTextLimit = 8_000;
// The gateway caps server-function requests at 1 MiB, including base64 and JSON.
export const pageImageLimit = 750_000;
export const textBatchSize = 3;
export const topicLimit = 80;
export const knownTopicLimit = 16;

const physicalPage = z.number().int().min(1).max(maxBookPages);
const image = z.string().max(Math.ceil(pageImageLimit / 3) * 4).startsWith("/9j/").regex(/^[A-Za-z0-9+/]+={0,2}$/);
const inputPage = z.union([
  z.strictObject({ number: physicalPage, text: z.string().trim().min(1).max(pageTextLimit) }),
  z.strictObject({ number: physicalPage, image, scan: z.literal(true).optional(), sourceText: z.string().trim().min(1).max(pageTextLimit).optional() }),
  z.strictObject({ number: physicalPage, transcription: scanTranscription }),
]);

export const previousPageContext = z.strictObject({ number: physicalPage, text: z.string().trim().min(1).max(12_000) });
export type PreviousPageContext = z.infer<typeof previousPageContext>;

export const pageReviewInput = z.object({
  academyId: z.guid(),
  knownTopics: z.array(z.string().trim().min(1).max(topicLimit)).max(knownTopicLimit).optional(),
  previousPage: previousPageContext.optional(),
  transcriptionOnly: z.literal(true).optional(),
  pages: z.array(inputPage).min(1).max(textBatchSize).refine(pages =>
    pages.length === 1 || pages.every((page, i) => "text" in page && (!i || page.number === pages[i - 1].number + 1)),
  ),
}).refine(input => !input.previousPage || input.previousPage.number === (input.pages[0]?.number ?? 0) - 1)
  .refine(input => !input.transcriptionOnly || input.pages.length === 1 &&
    ("transcription" in input.pages[0] || "image" in input.pages[0] && input.pages[0].scan === true));

const choice = z.object({ key: z.string().trim().min(1).max(8), text: z.string().trim().min(1).max(1_000) });
export const reviewedQuestion = z.object({
  sourceExerciseId: z.number().int().min(1).max(60).nullable().optional(),
  number: z.string().trim().min(1).max(24).nullable(),
  section: z.string().trim().min(1).max(120).nullable(),
  topic: z.string().trim().min(1).max(topicLimit).nullable().optional(),
  prompt: z.string().trim().min(1).max(3_000),
  choices: z.array(choice).max(8).refine(items => items.length !== 1 && new Set(items.map(item => item.key.toLowerCase())).size === items.length),
  markedChoiceKey: z.string().trim().min(1).max(8).nullable().optional(),
  modelAnswer: z.string().trim().min(1).max(10_000).nullable().optional(),
  check: z.string().trim().max(400),
  continuationPages: z.array(physicalPage).max(textBatchSize - 1),
  visuals: z.array(reviewedVisual).max(8),
});

const outputPageShape = z.object({
  number: physicalPage,
  kind: z.enum(["questions", "reference", "answer_key", "unclear"]),
  note: z.string().trim().max(400),
  needsPageReview: z.boolean().optional(),
  needsImage: z.boolean(),
  questions: z.array(reviewedQuestion).max(60),
});
export const geminiPageResult = outputPageShape.omit({ number: true }).required({ needsPageReview: true }).extend({
  questions: z.array(reviewedQuestion.required({ topic: true, markedChoiceKey: true, modelAnswer: true })).max(60),
});
export const geminiScanResult = geminiPageResult.omit({ needsImage: true }).extend({
  questions: z.array(reviewedQuestion.omit({ visuals: true, continuationPages: true })
    .required({ sourceExerciseId: true, topic: true, markedChoiceKey: true, modelAnswer: true })).max(60),
});
export const outputPage = outputPageShape.refine(page => page.kind === "questions" ? page.questions.length > 0 : page.questions.length === 0);

export const geminiPageOutput = z.object({ pages: z.array(outputPage).min(1).max(textBatchSize) });
export type ReviewPageInput = z.infer<typeof inputPage>;
export type ReviewedPage = z.infer<typeof outputPage>;
export type PageReviewInput = z.infer<typeof pageReviewInput>;
// After provider validation, the server converts visual bounds to fractions for browser cropping.
export type PageReview = z.infer<typeof geminiPageOutput>;
