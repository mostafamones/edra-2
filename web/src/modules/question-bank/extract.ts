import { assessSuggestedCrop, cropSource, fitPageImage, sourceDataUrl, type QuestionVisual } from "./evidence";
import { findPrintedMarks } from "./marked-choices";
import { choiceKey, type PageIssue, type Question, type SourcePage } from "./parser";
import { knownTopicLimit, pageImageLimit, pageTextLimit, textBatchSize, type PageReviewInput, type ReviewedPage, type PreviousPageContext } from "./review-contract";
import { reviewQuestionPage } from "./review";
import { topicKey } from "./topics";
import type { ScanTranscription } from "./scan-contract";

const visualReference = /\b(?:figure|diagram|chart|graph|histogram|illustration|table|pictured|shown below|shown above)\b|(?:الشكل|الرسم|الجدول|المخطط|الصورة)/iu;
const complexNotation = /[\uFFFD∫∑√∏∂≤≥±⊥∠⃗]|\b(?:latex|\w\s*\^\s*\d)\b/iu;

export function planExtraction(pages: SourcePage[]) {
  const batches: { mode: "text" | "image"; pages: SourcePage[] }[] = [];
  for (const page of pages) {
    if (page.blankImage) continue;
    const text = page.text.trim();
    const mode = page.mode === "scan" || page.preferImage || page.error || text.length < 24 || text.length > pageTextLimit ||
      visualReference.test(text) || complexNotation.test(text) ? "image" : "text";
    const last = batches.at(-1);
    if (mode === "text" && last?.mode === "text" && last.pages.length < textBatchSize &&
      last.pages.at(-1)?.number === page.number - 1) last.pages.push(page);
    else batches.push({ mode, pages: [page] });
  }
  return batches;
}

export type GeminiImport = {
  questions: Question[];
  issues: PageIssue[];
  visuals: Record<string, QuestionVisual[]>;
  failedPages?: number[];
};

export class ScanResultCache {
  static readonly version = 6;
  readonly version = ScanResultCache.version;
  private readonly results = new Map<number, ReviewedPage>();
  private readonly transcriptions = new Map<number, ScanTranscription>();
  private readonly contexts = new Map<number, string | undefined>();

  getTranscription(page: number) { return this.transcriptions.get(page); }

  rememberTranscription(page: number, transcription: ScanTranscription) {
    this.transcriptions.delete(page);
    this.transcriptions.set(page, transcription);
    if (this.transcriptions.size > 128) this.transcriptions.delete(this.transcriptions.keys().next().value!);
  }

  get(page: number, context?: string) {
    if (this.contexts.get(page) !== context) return;
    const result = this.results.get(page);
    if (result) {
      this.results.delete(page);
      this.results.set(page, result);
    }
    return result;
  }

  remember(result: ReviewedPage, context?: string) {
    if (result.kind === "unclear" || result.needsImage || result.needsPageReview || result.questions.some(question => question.check)) return;
    this.results.delete(result.number);
    this.results.set(result.number, result);
    this.contexts.set(result.number, context);
    if (this.results.size > 128) {
      const oldest = this.results.keys().next().value!;
      this.results.delete(oldest); this.contexts.delete(oldest);
    }
  }
}

const errors = {
  input: "This page couldn’t be sent to Gemini",
  unavailable: "Gemini isn’t available on this development server",
  denied: "You don’t have permission to use Gemini in this academy",
  quota: "Gemini’s usage limit was reached",
  provider: "Gemini didn’t respond",
  busy: "Gemini is temporarily unavailable",
  invalid: "Gemini returned an incomplete or invalid result",
  truncated: "Gemini stopped before finishing its response",
  timeout: "Gemini timed out while reading this page",
};

export function mergeExtraction(previous: GeminiImport, update: GeminiImport, retried: readonly number[]): GeminiImport {
  const requested = new Set(retried);
  const failedPages = [...(previous.failedPages ?? []).filter(page => !requested.has(page)), ...(update.failedPages ?? [])].sort((a, b) => a - b);
  return {
    questions: [...previous.questions, ...update.questions].sort((a, b) => a.page - b.page),
    issues: [...previous.issues.filter(issue => !requested.has(issue.page)), ...update.issues],
    visuals: { ...previous.visuals, ...update.visuals },
    ...(failedPages.length ? { failedPages } : {}),
  };
}

export async function extractWithGemini(academyId: string, pages: SourcePage[], signal: AbortSignal, onProgress: (text: string) => void, scanCache?: ScanResultCache, contextSources: SourcePage[] = []): Promise<GeminiImport> {
  const results = new Map<number, ReviewedPage>();
  const issues: PageIssue[] = [];
  const attemptedImages = new Set<number>();
  const transcriptions = new Map<number, ScanTranscription>();
  const missingContext = new Set<number>();
  const transcriptFor = (number: number) => transcriptions.get(number) ?? scanCache?.getTranscription(number);
  let stopped: string | undefined;
  const issue = (page: number, reason: string) => issues.push({ source: "Book", page, reason, retryable: false });
  for (const page of pages) if (page.blankImage) issue(page.number, page.error ?? "Page rendered blank. Compare it with the original PDF.");

  async function request(mode: "text" | "image", batch: SourcePage[], transcriptionOnly = false): Promise<string | undefined> {
    signal.throwIfAborted();
    let previousPage: PreviousPageContext | undefined;
    if (!transcriptionOnly) {
      const previousNumber = batch[0].number - 1;
      const source = [...pages, ...contextSources].find(page => page.number === previousNumber);
      if (source?.mode === "scan" && !source.blankImage && !transcriptFor(previousNumber) && !attemptedImages.has(previousNumber)) {
        onProgress(`Reading previous-page context · Page ${previousNumber}`);
        await request("image", [source], true);
        signal.throwIfAborted();
      }
      const text = transcriptFor(previousNumber)?.transcript ?? (source?.mode !== "scan" && !source?.error && !source?.blankImage ? source?.text : undefined);
      if (text?.trim()) previousPage = { number: previousNumber, text: text.trim().slice(-12_000) };
      else if (source) missingContext.add(batch[0].number);
    }
    const scanNumber = mode === "image" && batch[0].mode === "scan" ? batch[0].number : undefined;
    const cached = transcriptionOnly || scanNumber === undefined ? undefined : scanCache?.get(scanNumber, previousPage?.text);
    if (cached) {
      results.set(cached.number, cached);
      onProgress(`Reusing scan result · Page ${cached.number}`);
      return;
    }
    if (stopped) { batch.forEach(page => issue(page.number, `${stopped}; page not extracted`)); return; }
    const numbers = batch.map(page => page.number);
    onProgress(`Gemini · ${batch.length === 1 ? `Page ${numbers[0]}` : `Pages ${numbers[0]}–${numbers.at(-1)}`}`);
    const payload: PageReviewInput["pages"] = [];
    const transcription = scanNumber === undefined ? undefined : transcriptFor(scanNumber);
    if (mode === "text") payload.push(...batch.map(page => ({ number: page.number, text: page.text.trim() })));
    else if (transcription) {
      payload.push({ number: batch[0].number, transcription });
      onProgress(`Reusing transcription · Page ${batch[0].number}`);
    }
    else {
      const [page] = batch;
      attemptedImages.add(page.number);
      if (!page.image) {
        issue(page.number, "No usable page image for Gemini. Check the original PDF");
        return "input";
      }
      let encoded: string;
      try {
        const target = pageImageLimit;
        const image = page.image.size > target
          ? await fitPageImage(page.image, target) ?? (page.image.size <= pageImageLimit ? page.image : undefined)
          : page.image;
        if (!image) { issue(page.number, "Page image is too large to send without losing detail"); return "input"; }
        encoded = await sourceDataUrl(image);
      }
      catch { issue(page.number, "Couldn’t read the page image"); return "input"; }
      const sourceText = page.text.trim();
      payload.push({ number: page.number, image: encoded.slice(encoded.indexOf(",") + 1), ...(page.mode === "scan" ? { scan: true as const } : {}),
        ...(page.mode !== "scan" && sourceText && sourceText.length <= pageTextLimit ? { sourceText } : {}),
      });
    }
    signal.throwIfAborted();
    try {
      const labels = new Map<string, string>();
      for (const reviewed of results.values()) for (const question of reviewed.questions) {
        if (question.topic && labels.size < knownTopicLimit) labels.set(topicKey(question.topic), question.topic);
      }
      const knownTopics = [...labels.values()];
      const result = await reviewQuestionPage({ data: { academyId, pages: payload, ...(knownTopics.length ? { knownTopics } : {}),
        ...(previousPage ? { previousPage } : {}), ...(transcriptionOnly ? { transcriptionOnly: true } : {}) }, signal });
      signal.throwIfAborted();
      if (scanNumber !== undefined && result.transcription) {
        transcriptions.set(scanNumber, result.transcription);
        scanCache?.rememberTranscription(scanNumber, result.transcription);
      }
      if (result.ok) {
        if (transcriptionOnly) return;
        for (const page of result.review.pages) {
          results.set(page.number, page);
          if (page.number === scanNumber) scanCache?.remember(page, previousPage?.text);
        }
        const returned = new Set(result.review.pages.map(page => page.number));
        numbers.filter(number => !returned.has(number)).forEach(number => issue(number, `${errors.invalid}; page not extracted`));
      }
      else {
        const phase = result.stage === "scan" ? "transcribing the scan" : result.stage === "drafts" ? "extracting questions" : undefined;
        const message = phase && ["busy", "timeout", "provider"].includes(result.code) ? `${errors[result.code]} (${phase})` : errors[result.code];
        if (result.code === "quota" || result.code === "denied" || result.code === "unavailable") stopped = message;
        numbers.forEach(number => issue(number, results.has(number) ? `${message}; image check incomplete` : `${message}; page not extracted`));
        return result.code;
      }
    } catch {
      signal.throwIfAborted();
      numbers.forEach(number => issue(number, "Couldn’t reach Edra’s Gemini extraction service"));
    }
  }

  const textFallbacks = new Set<number>();
  for (const batch of planExtraction(pages)) {
    const failure = await request(batch.mode, batch.pages);
    if (batch.mode === "image") {
      const [page] = batch.pages;
      const text = page.text.trim();
      if ((failure === "invalid" || failure === "input" || failure === "truncated") && page.mode !== "scan" && text.length >= 24 && text.length <= pageTextLimit) {
        const before = issues.length - 1;
        await request("text", [page]);
        if (results.has(page.number)) {
          textFallbacks.add(page.number);
          issues.splice(before, 1);
          issue(page.number, "Recovered from PDF text. Check figures and layout against the original page");
        }
      }
    } else {
      for (const page of batch.pages) {
        if (results.get(page.number)?.needsImage && !attemptedImages.has(page.number)) await request("image", [page]);
      }
    }
  }

  signal.throwIfAborted();
  const questions: Question[] = [];
  const visuals: GeminiImport["visuals"] = {};
  for (const source of pages) {
    const result = results.get(source.number);
    if (!result) continue;
    if (result.kind === "unclear" || result.needsPageReview) issue(source.number, result.note || "Check the extracted page against the original");
    else if (result.needsImage) issue(source.number, "Compare layout and visuals with the original page");
    for (const [index, item] of result.questions.entries()) {
      const id = `gemini:${item.number ? "" : "unnumbered:"}${source.number}:${index}`;
      const flags = [item.check, ...(result.needsImage ? ["Check the original page"] : []),
        ...(missingContext.has(source.number) ? ["Previous-page context could not be read. Check the instruction for continuation exercises."] : []),
        ...(source.mode === "scan" ? ["Check the extracted text and notation against the scan"] : []),
        ...(textFallbacks.has(source.number) ? ["Check figures and layout against the original page"] : [])].filter(Boolean);
      const attachments: QuestionVisual[] = [];
      if (source.image) {
        for (const visual of item.visuals) {
          try {
            const image = await cropSource(source.image, visual.bounds);
            const cropIssue = await assessSuggestedCrop(image);
            if (cropIssue) flags.push(cropIssue);
            else attachments.push({ ...visual, page: source.number, image });
          }
          catch { flags.push("Couldn’t attach a suggested figure. Crop it from the source page"); }
        }
      }
      if (attachments.length) { visuals[id] = attachments; flags.push("Check the attached crop against the original page"); }
      const printed = findPrintedMarks(source.markedChoices ?? [], item.choices);
      const conflicting = printed.length > 1 ||
        (printed.length === 1 && item.markedChoiceKey && printed[0] !== choiceKey(item.markedChoiceKey));
      if (conflicting) flags.push("Check the marked choices against the original page");
      const marker = conflicting ? null : printed[0] ?? item.markedChoiceKey;
      const marked = marker ? item.choices.filter(choice => choiceKey(choice.key) === choiceKey(marker)) : [];
      questions.push({
        id, number: item.number ?? "Unnumbered", section: item.section, topic: item.topic, page: source.number, prompt: item.prompt, choices: item.choices,
        continuations: item.continuationPages.map(page => ({ page })), issues: [...new Set(flags)],
        ...(marked.length === 1 ? { answer: { key: marked[0].key, page: source.number, source: "book", marked: true } } : {}),
        ...(!item.choices.length && item.modelAnswer ? { modelAnswer: item.modelAnswer } : {}),
      });
    }
  }
  const failedPages = pages.filter(page => !page.blankImage && !results.has(page.number)).map(page => page.number);
  return { questions, issues, visuals, ...(failedPages.length ? { failedPages } : {}) };
}
