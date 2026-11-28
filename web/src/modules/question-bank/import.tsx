import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeMathSource, mathIssue } from "@/lib/math";
import { normalizePrompt } from "./prompt";
import { QuestionTextField } from "./text-field";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, Alert02Icon, ArrowLeft01Icon, BookOpen01Icon, Download01Icon, File01Icon, FileUploadIcon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import Link from "@/components/shared/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { staffAcademyHref } from "@/lib/routing";
import { newUuid } from "@/lib/uuid";
import { parseImport, type PageIssue, type Question, type SourceCrop, type SourcePage, type SourceRegion } from "./parser";
import { inspectPdf, readPdf, retryPage } from "./pdf";
import { maxBatchPages, nextPageRange, validPageRange, type PageRange } from "./import-limits";
import { cropSource, sourceDataUrl, type QuestionVisual } from "./evidence";
import { CropDialog } from "./crop-dialog";
import { sampleBook, sampleKey } from "./sample";
import { useImageBlob } from "./use-image";
import { extractWithGemini, mergeExtraction, ScanResultCache, type GeminiImport } from "./extract";
import { changeTopics, groupTopics, type TopicAssignment, type TopicEdits } from "./topics";
import { TopicsDialog } from "./topics-dialog";
import { AssignUnits, type LinkSelection } from "./assign-units";
import { saveQuestionBank } from "./bank";
import { bankKeys, collectionsOptions, type BankScope } from "./queries";
import { sectionRuns } from "./sections";
import { LeaveGuard } from "./leave-guard";
import { maxSaveBytes, type SaveBankInput } from "./bank-contract";

type Source = { name: string; pages: SourcePage[] };
type SourceDocument = { id: string; name: string };
type Batch = { book: Source; document: SourceDocument; key?: Source; extracted?: GeminiImport; file?: File; range?: PageRange; partial?: boolean };
type Attachment = QuestionVisual & { id: number };
type Edit = { prompt: string; choices: Question["choices"]; visuals: Attachment[]; answer: string | null; answerSource?: { file: string; page: number }; modelAnswer: string; reviewed: boolean };
type Selection = { question: string } | { issue: PageIssue };
type Tab = "questions" | "attention" | "reviewed" | "excluded" | "pages";

function SourcePreview({ page, crop }: { page?: SourcePage; crop?: SourceCrop }) {
  const blob = page?.image;
  const [source, setSource] = useState<{ blob: Blob; crop?: SourceCrop; url: string; cropped: boolean }>();
  useEffect(() => {
    if (!blob) return;
    let active = true;
    let url: string | undefined;
    const show = (image: Blob, cropped: boolean) => {
      if (!active) return;
      url = URL.createObjectURL(image);
      setSource({ blob, crop, url, cropped });
    };
    if (crop) void cropSource(blob, crop).then(image => show(image, true), () => show(blob, false));
    else show(blob, false);
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [blob, crop]);
  if (blob) return source?.blob === blob && source.crop === crop
    ? <img src={source.url} className="mx-auto h-auto w-full max-w-xl rounded-sm bg-white shadow-sm" alt={`${source.cropped ? "Question excerpt from page" : "Original page"} ${page?.number}`} />
    : <p role="status" className="p-4 text-sm text-muted-foreground">Opening source…</p>;
  if (page?.text) return <div className="mx-auto min-h-52 max-w-xl rounded-sm bg-white p-6 text-sm leading-7 whitespace-pre-wrap text-zinc-900 shadow-sm" dir="auto">{page.text}</div>;
  return <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} strokeWidth={1.5} /></EmptyMedia><EmptyTitle>No page preview</EmptyTitle></EmptyHeader></Empty>;
}

function AttachmentPreview({ image, description }: Pick<QuestionVisual, "image" | "description">) {
  const imageRef = useImageBlob(image);
  return <img ref={imageRef} alt={description} className="mx-auto max-h-48 max-w-full rounded-sm bg-white object-contain" />;
}

const initialEdit = (q: Question): Edit => ({ prompt: normalizePrompt(q.prompt, q.number), choices: q.choices.map(c => ({ ...c, text: normalizeMathSource(c.text) })), visuals: [], answer: null, modelAnswer: normalizeMathSource(q.modelAnswer ?? ""), reviewed: false });
const newDocument = "new";
const noScope: BankScope = { academyId: "", academySlug: "", accountId: "" };
const documentTitle = (file: File) => file.name.replace(/\.pdf$/iu, "").trim().slice(0, 255) || file.name.slice(0, 255);
const sourceName = (issue: PageIssue) => issue.source === "Book" ? "book" : "key";
const pdfError = (cause: unknown) => cause instanceof Error && cause.message.startsWith("Choose a PDF")
  ? cause.message : "Couldn’t open the PDF. Choose a readable PDF without a password.";

async function download(batch: Batch, records: Question[], edits: Record<string, Edit>, topics: Map<string, TopicAssignment[]>) {
  const assets = new Map<number, Promise<string>>();
  function evidence(region: SourceRegion) {
    const image = batch.book.pages.find(page => page.number === region.page)?.image;
    if (image && !assets.has(region.page)) assets.set(region.page, sourceDataUrl(image));
    return { ...region, ...(image ? { image: `page-${region.page}` } : {}) };
  }
  const questions = records.map(async q => {
    const e = edits[q.id];
    const source = { file: batch.book.name, ...evidence({ page: q.page, crop: q.crop }), possibleContinuations: q.continuations?.map(evidence) };
    const visuals = await Promise.all(e.visuals.map(async visual => ({
      description: visual.description, source: { page: visual.page, bounds: visual.bounds }, image: await sourceDataUrl(visual.image),
    })));
    return {
      section: q.section, printedNumber: q.number, prompt: e.prompt, choices: e.choices,
      topic: topics.get(q.id)?.[0] ?? null, topics: topics.get(q.id) ?? [],
      answer: e.answer ? { choiceKey: e.answer, verification: "human", source: e.answerSource } : null,
      ...(!e.choices.length && e.modelAnswer.trim() ? { modelAnswer: e.modelAnswer.trim() } : {}),
      source, visuals,
    };
  });
  const [data, sourceImages] = await Promise.all([
    Promise.all(questions),
    Promise.all([...assets].map(async ([page, value]) => [`page-${page}`, await value])).then(Object.fromEntries),
  ]);
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, questions: data, sourceImages }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "edra-reviewed-questions.json"; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function QuestionImportPage({ geminiAcademyId, bankScope }: { geminiAcademyId?: string; bankScope?: BankScope } = {}) {
  const [bookFiles, setBookFiles] = useState<File[]>([]);
  const [fileIndex, setFileIndex] = useState(0);
  const bookFile = bookFiles[fileIndex];
  const [pdfInfo, setPdfInfo] = useState<{ file: File; pages: number } | { file: File; error: string }>();
  const [chosenRange, setChosenRange] = useState<{ file: File; range: PageRange }>();
  const inspected = pdfInfo?.file === bookFile ? pdfInfo : undefined;
  const totalPages = inspected && "pages" in inspected ? inspected.pages : 0;
  const range = chosenRange && chosenRange.file === bookFile ? chosenRange.range : nextPageRange(1, totalPages);
  const largeBook = totalPages > maxBatchPages;
  const partialRange = range.first !== 1 || range.last !== totalPages;
  const readyToImport = !!bookFile && validPageRange(range, totalPages);
  function sourceDocument(file: File): SourceDocument | undefined {
    if (existingDocument) return { id: existingDocument.id, name: existingDocument.name };
    const name = choice?.name.trim();
    if (!name) return;
    let id = documentIds.current.get(file);
    if (!id) { id = newUuid(); documentIds.current.set(file, id); }
    return { id, name };
  }
  useEffect(() => {
    if (!bookFile) return;
    let active = true;
    void inspectPdf(bookFile).then(pages => {
      if (active) setPdfInfo({ file: bookFile, pages });
    }, cause => {
      if (active) setPdfInfo({ file: bookFile, error: pdfError(cause) });
    });
    return () => { active = false; };
  }, [bookFile]);
  const [keyFile, setKeyFile] = useState<File>();
  const collections = useQuery({ ...collectionsOptions(bankScope ?? noScope), enabled: !!bankScope });
  const libraryDocuments = collections.data?.collections.filter(item => item.kind === "source_document") ?? [];
  // One identity per selected PDF for this import, reused across page ranges and save batches.
  const documentIds = useRef(new WeakMap<File, string>());
  const sampleDocument = useRef<SourceDocument>(null);
  const [documentChoice, setDocumentChoice] = useState<{ file: File; existing: string; name: string }>();
  const choice = documentChoice?.file === bookFile ? documentChoice : bookFile ? { file: bookFile, existing: newDocument, name: documentTitle(bookFile) } : undefined;
  const existingDocument = libraryDocuments.find(item => item.id === choice?.existing);
  const [batch, setBatch] = useState<Batch>();
  const [status, setStatus] = useState("");
  const [importState, setImportState] = useState<"idle" | "running" | "stopping">("idle");
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const nextVisualId = useRef(0);
  const importRun = useRef<AbortController>(null);
  const scanCacheByFile = useRef(new WeakMap<File, ScanResultCache>());
  useEffect(() => () => importRun.current?.abort(), []);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [topicEdits, setTopicEdits] = useState<TopicEdits>({});
  const [topicFilter, setTopicFilter] = useState<string>();
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [saveNotice, setSaveNotice] = useState("");
  const bankIds = useRef(new Map<string, string>());
  const savingBank = useRef(false);
  const [selection, setSelection] = useState<Selection>();
  const [tab, setTab] = useState<Tab>("questions");
  const [keyVisible, setKeyVisible] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [fullPage, setFullPage] = useState(false);
  const [importOpen, setImportOpen] = useState(true);
  const [replaceWith, setReplaceWith] = useState<"local" | "sample">();
  const report = useMemo(() => batch ? parseImport(batch.book.pages, batch.key?.pages, batch.extracted, batch.partial) : null, [batch]);
  const q = selection && "question" in selection ? report?.questions.find(q => q.id === selection.question) : undefined;
  const issue = selection && "issue" in selection ? selection.issue : undefined;
  const e = q ? edits[q.id] ?? initialEdit(q) : undefined;
  const promptMathError = e ? mathIssue(e.prompt) : undefined;
  const answerMathError = e && !e.choices.length ? mathIssue(e.modelAnswer) : undefined;
  const choiceMathErrors = e?.choices.map(choice => mathIssue(choice.text)) ?? [];
  const invalidMath = !!(promptMathError || answerMathError || choiceMathErrors.some(Boolean));
  const included = report?.questions.filter(q => !excluded.has(q.id)) ?? [];
  const { groups, primary, assignments } = groupTopics(included, topicEdits);
  const libraryTopics = collections.data?.collections.filter(item => item.kind === "topic").map(item => item.name) ?? [];
  const customCollections = collections.data?.collections.filter(item => item.kind === "custom") ?? [];
  const filteredTopic = groups.find(group => group.key === topicFilter);
  const reviewed = included.filter(q => edits[q.id]?.reviewed);
  const saveGroups = primary.map(group => ({ ...group, questions: group.questions.filter(question => edits[question.id]?.reviewed && !savedIds.has(question.id)) }))
    .filter(group => group.questions.length > 0);
  const flagged = included.filter(q => q.issues.length && !edits[q.id]?.reviewed).length;
  const pageIssues = report?.issues.length ?? 0;
  const issuePages = [...new Map((report?.issues ?? []).map(item => [`${item.source}:${item.page}`, item])).values()];
  const selectedPageIssues = issue ? report?.issues.filter(item => item.source === issue.source && item.page === issue.page) ?? [] : [];
  const retryableIssue = selectedPageIssues.find(item => item.retryable);
  const list = tab === "excluded" ? report?.questions.filter(q => excluded.has(q.id)) ?? []
    : included.filter(q => tab === "reviewed" ? edits[q.id]?.reviewed : tab === "attention" ? q.issues.length && !edits[q.id]?.reviewed : true);
  const visibleQuestions = tab === "questions" && filteredTopic ? filteredTopic.questions : list;
  const answerDocument = q?.answer?.source === "book" ? batch?.book : batch?.key;
  const shownSource = keyVisible && q?.answer ? answerDocument : issue?.source === "Answer key" ? batch?.key : batch?.book;
  const regions = q ? [{ page: q.page, crop: q.crop }, ...(q.continuations ?? []),
    ...(batch?.book.pages.some(page => page.number === q.page - 1) ? [{ page: q.page - 1, crop: undefined }] : [])] : [];
  const region = regions[sourceIndex] ?? regions[0];
  const shownPage = keyVisible && q?.answer ? q.answer.page : issue?.page ?? region?.page;
  const page = shownSource?.pages.find(page => page.number === shownPage);
  const crop = !fullPage && !keyVisible && !issue ? region?.crop : undefined;
  const unsaved = included.some(question => !savedIds.has(question.id));
  const sameBook = batch?.file === bookFile;
  const lastPage = sameBook ? batch?.range?.last : undefined;
  const failedPages = batch?.extracted?.failedPages ?? [];
  const nextRange = lastPage && lastPage < totalPages && !failedPages.length ? nextPageRange(lastPage + 1, totalPages) : undefined;

  function chooseBook(index: number) {
    setFileIndex(index);
    setKeyFile(undefined);
    setChosenRange(undefined);
    setError("");
  }

  function scanCache(file: File) {
    let cache = scanCacheByFile.current.get(file);
    if (!cache || cache.version !== ScanResultCache.version) {
      cache = new ScanResultCache();
      scanCacheByFile.current.set(file, cache);
    }
    return cache;
  }

  function openSample() {
    if (savingBank.current) return;
    setError("");
    sampleDocument.current ??= { id: newUuid(), name: "Sample question book" };
    open({ book: { name: "Sample question book", pages: sampleBook }, document: sampleDocument.current, key: { name: "Sample answer key", pages: sampleKey } });
  }

  function select(next?: Selection) {
    setSelection(next);
    setSourceIndex(0);
    setFullPage(false);
    setKeyVisible(false);
  }

  function open(next: Batch) {
    const parsed = parseImport(next.book.pages, next.key?.pages, next.extracted, next.partial);
    const withVisuals: Record<string, Edit> = {};
    for (const question of parsed.questions) {
      const attachments = next.extracted?.visuals[question.id];
      if (attachments) withVisuals[question.id] = { ...initialEdit(question), visuals: attachments.map(visual => ({ ...visual, id: ++nextVisualId.current })) };
    }
    setBatch(next); setEdits(withVisuals); setExcluded(new Set());
    setTopicEdits({}); setTopicFilter(undefined);
    setSavedIds(new Set()); setSaveNotice(""); bankIds.current.clear();
    setTab(!parsed.questions.length && parsed.issues.length ? "pages" : "questions");
    setImportOpen(false);
    select(parsed.questions[0] ? { question: parsed.questions[0].id } : parsed.issues[0] ? { issue: parsed.issues[0] } : undefined);
  }

  async function importFiles(mode: "local" | "gemini" = "local") {
    const identity = bookFile && sourceDocument(bookFile);
    if (!bookFile || !identity || !readyToImport || status || importRun.current || savingBank.current || (mode === "gemini" && !geminiAcademyId)) return;
    const run = new AbortController();
    importRun.current = run;
    setImportState("running");
    setError(""); setStatus("Opening question book…");
    const process = (file: File, kind: string, path: "local" | "gemini" | "answer-key", selected?: PageRange) => readPdf(file, (n, total, scanning) => {
      if (!run.signal.aborted) setStatus(`${scanning ? "Reading scan" : "Opening page"} ${n} of ${total} · ${kind}`);
    }, path, selected, run.signal).then(pages => ({ name: file.name, pages }));
    let extracting = false;
    try {
      const book = await process(bookFile, bookFile.name, mode, range);
      if (mode === "gemini" && range.first > 1) {
        const previousNumber = range.first - 1;
        const previous = batch?.file === bookFile ? batch.book.pages.find(page => page.number === previousNumber) : undefined;
        const context = previous ?? (await process(bookFile, "Previous-page context", "gemini", { first: previousNumber, last: previousNumber })).pages[0];
        if (context) book.pages.unshift(context);
      }
      const key = keyFile && !partialRange ? await process(keyFile, "Answer key", "answer-key") : undefined;
      run.signal.throwIfAborted();
      extracting = mode === "gemini";
      const extracted = extracting && geminiAcademyId ? await extractWithGemini(geminiAcademyId, book.pages.filter(page => page.number >= range.first), run.signal, setStatus, scanCache(bookFile), book.pages) : undefined;
      if (!run.signal.aborted) {
        if (batch && extracted && !extracted.questions.length && extracted.issues.length) {
          setError(`Page ${extracted.issues[0].page}: ${extracted.issues[0].reason}. Your current review is still open.`);
          return;
        }
        open({ book, document: identity, key, extracted, file: bookFile, range, partial: partialRange });
      }
    } catch (cause) {
      if (run.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "";
      setError(extracting ? message || "Couldn’t finish Gemini extraction. Try again or use local extraction."
        : pdfError(cause));
    } finally { importRun.current = null; setImportState("idle"); setStatus(""); }
  }

  async function retry(i: PageIssue) {
    if (!batch || status) return;
    const kind = sourceName(i), source = batch[kind];
    const original = source?.pages.find(p => p.number === i.page);
    if (!source || !original?.image) return;
    setError(""); setStatus(`Retrying page ${i.page}…`);
    try {
      const next = await retryPage(original);
      const replacement = { ...source, pages: source.pages.map(p => p.number === i.page ? next : p) };
      const updated = { ...batch, [kind]: replacement };
      const result = parseImport(updated.book.pages, updated.key?.pages, updated.extracted, updated.partial);
      const first = kind === "book" ? result.questions.find(q => q.page === i.page) : undefined;
      const nextIssue = result.issues.find(p => p.page === i.page && p.source === i.source)
        ?? (!first ? result.issues[0] : undefined);
      setBatch(updated);
      setTab(nextIssue ? "pages" : "questions");
      select(nextIssue ? { issue: nextIssue } : first ? { question: first.id } : result.questions[0] ? { question: result.questions[0].id } : undefined);
    } catch { setError("Couldn’t retry OCR. Check your connection for the OCR model download and try again."); }
    finally { setStatus(""); }
  }

  async function retryGemini(onlyPage?: number) {
    if (!batch?.extracted || !geminiAcademyId || status || importRun.current || savingBank.current) return;
    const pending = new Set(failedPages.filter(number => onlyPage === undefined || number === onlyPage));
    const pages = batch.book.pages.filter(page => pending.has(page.number));
    if (!pages.length) return;
    const run = new AbortController();
    importRun.current = run;
    setImportState("running");
    setStatus("Retrying extraction…");
    setError("");
    try {
      const update = await extractWithGemini(geminiAcademyId, pages, run.signal, setStatus, batch.file ? scanCache(batch.file) : undefined, batch.book.pages);
      run.signal.throwIfAborted();
      const extracted = mergeExtraction(batch.extracted, update, pages.map(page => page.number));
      const editsForNewQuestions: Record<string, Edit> = {};
      for (const question of update.questions) {
        const attachments = update.visuals[question.id];
        if (attachments) editsForNewQuestions[question.id] = { ...initialEdit(question), visuals: attachments.map(visual => ({ ...visual, id: ++nextVisualId.current })) };
      }
      setEdits(previous => ({ ...previous, ...editsForNewQuestions }));
      setBatch({ ...batch, extracted });
      if (issue?.source === "Book" && pending.has(issue.page)) {
        const nextIssue = extracted.issues.find(item => item.page === issue.page) ?? extracted.issues[0];
        const first = update.questions.find(question => question.page === issue.page) ?? extracted.questions[0];
        if (nextIssue) select({ issue: nextIssue });
        else { setTab("questions"); select(first ? { question: first.id } : undefined); }
      }
    } catch {
      if (!run.signal.aborted) setError("Couldn’t retry extraction. Your current review is still open.");
    } finally { importRun.current = null; setImportState("idle"); setStatus(""); }
  }

  function patch(change: Partial<Edit>) {
    if (!q) return;
    const resetAnswer = change.prompt !== undefined || change.choices !== undefined;
    setEdits(prev => ({
      ...prev,
      [q.id]: { ...(prev[q.id] ?? initialEdit(q)), ...(resetAnswer ? { answer: null, answerSource: undefined } : {}), reviewed: false, ...change },
    }));
  }

  async function exportReviewed() {
    if (!batch || !reviewed.length || status) return;
    setError("");
    setStatus("Preparing export…");
    try { await download(batch, reviewed, edits, assignments); }
    catch { setError("Couldn’t prepare the export. Your reviewed questions are still here."); }
    finally { setStatus(""); }
  }

  async function saveToBank(selection: LinkSelection) {
    if (!batch || !bankScope || savingBank.current) return "Couldn’t start this save.";
    const byId = new Map(reviewed.filter(q => !savedIds.has(q.id)).map(q => [q.id, q]));
    if (selection.links.some(link => !byId.has(link.questionId))) return "The review changed. Check the selected questions again.";
    savingBank.current = true;
    try {
      const sections = sectionRuns(report?.questions ?? [], batch.range);
      const questions: SaveBankInput["questions"] = await Promise.all(selection.links.map(async ({ questionId, unitId }) => {
        const question = byId.get(questionId)!;
        const edit = edits[questionId];
        const id = bankIds.current.get(questionId) ?? newUuid();
        bankIds.current.set(questionId, id);
        // Only topics staff confirmed become memberships; suggestions are not saved.
        return { id, unitId, topics: topicEdits[questionId]?.confirmed ?? [], section: sections.get(questionId) ?? null, payload: {
          prompt: edit.prompt, choices: edit.choices, answer: edit.answer, ...(edit.answerSource ? { answerSource: edit.answerSource } : {}),
          ...(!edit.choices.length && edit.modelAnswer.trim() ? { modelAnswer: edit.modelAnswer.trim() } : {}),
          topic: null, section: question.section, printedNumber: question.number,
          source: { file: batch.book.name, page: question.page, continuationPages: question.continuations?.map(region => region.page) ?? [] },
          visuals: await Promise.all(edit.visuals.map(async visual => ({
            description: visual.description, bounds: visual.bounds, page: visual.page, image: await sourceDataUrl(visual.image),
          }))),
        } };
      }));
      const data: SaveBankInput = { academyId: bankScope.academyId, programId: selection.programId, document: batch.document, collectionId: selection.collectionId, questions };
      if (new TextEncoder().encode(JSON.stringify(data)).length > maxSaveBytes) return "This selection is too large. Save fewer questions at a time.";
      const result = await saveQuestionBank({ data });
      if (!result.ok) return result.message;
      setSavedIds(previous => new Set([...previous, ...selection.links.map(link => link.questionId)]));
      setSaveNotice(`Saved ${result.data} ${result.data === 1 ? "question" : "questions"} to the bank.`);
      return undefined;
    } catch {
      return "Couldn’t save these questions. Your review is still here.";
    } finally { savingBank.current = false; }
  }

  function toggleExcluded() {
    if (!q || status) return;
    const restore = excluded.has(q.id);
    const next = new Set(excluded);
    if (restore) next.delete(q.id); else next.add(q.id);
    setExcluded(next);
    if (restore && !next.size) {
      setTab("questions");
      select({ question: q.id });
      return;
    }
    const remaining = visibleQuestions.filter(item => item.id !== q.id);
    const nextQuestion = remaining[Math.min(remaining.length - 1, Math.max(0, visibleQuestions.findIndex(item => item.id === q.id)))];
    select(nextQuestion ? { question: nextQuestion.id } : undefined);
  }

  const libraryHref = bankScope && staffAcademyHref(bankScope.academySlug, "/question-bank");
  return <main className="page-shell space-y-4">
    <LeaveGuard when={importState !== "idle" || (!!batch && unsaved)} />
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {libraryHref && <Button asChild size="sm" variant="ghost"><Link href={libraryHref}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />Library</Link></Button>}
        <h1 className="font-heading text-2xl font-semibold">Import PDF</h1><Badge variant="secondary">Beta</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {batch && report && <>
        <Button variant="outline" disabled={!!status} aria-expanded={importOpen} aria-controls="qb-import" onClick={() => setImportOpen(open => !open)}>{importOpen ? "Hide import" : "Import PDF"}</Button>
        {geminiAcademyId && failedPages.length > 0 && <Button variant="outline" disabled={!!status} onClick={() => void retryGemini()}>
          Retry {failedPages.length} failed {failedPages.length === 1 ? "page" : "pages"} with Gemini
        </Button>}
        {!importOpen && bookFile && nextRange && <Button variant="outline" disabled={!!status} onClick={() => {
          setChosenRange({ file: bookFile, range: nextRange });
          setImportOpen(true);
        }}>Next pages: {nextRange.first}–{nextRange.last}</Button>}
        <Button variant="outline" disabled={!reviewed.length || !!status} onClick={() => void exportReviewed()}><HugeiconsIcon icon={Download01Icon} strokeWidth={1.5} />Export reviewed ({reviewed.length})</Button>
        {bankScope && <BankSave scope={bankScope} groups={saveGroups} collections={customCollections} disabled={!!status} onSave={saveToBank} />}
        </>}
      </div>
    </header>
    <Collapsible open={importOpen}>
    <CollapsibleContent id="qb-import" forceMount hidden={!importOpen}>
    <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={event => {
      event.preventDefault();
      if (!readyToImport || status) return;
      if (unsaved) setReplaceWith("local");
      else void importFiles();
    }}>
      <div className="flex flex-wrap items-end gap-4">
        <Field className="min-w-48 flex-1"><FieldLabel htmlFor="qb-book">Question PDFs</FieldLabel><Input id="qb-book" type="file" multiple accept=".pdf,application/pdf" disabled={!!status} onChange={e => {
          setBookFiles(Array.from(e.target.files ?? []));
          chooseBook(0);
        }} /></Field>
        {bookFiles.length > 1 && <Field className="min-w-48 flex-1"><FieldLabel htmlFor="qb-file">PDF to import</FieldLabel>
          <Select value={String(fileIndex)} disabled={!!status} onValueChange={value => chooseBook(Number(value))}>
            <SelectTrigger id="qb-file" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{bookFiles.map((file, index) => <SelectItem key={index} value={String(index)}>{index + 1}. {file.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>}
        {bookFile && choice && <Field className="min-w-48 flex-1"><FieldLabel htmlFor="qb-document">Source document</FieldLabel>
          <Select value={existingDocument ? choice.existing : newDocument} disabled={!!status || !libraryDocuments.length}
            onValueChange={existing => setDocumentChoice({ ...choice, existing })}>
            <SelectTrigger id="qb-document" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={newDocument}>New document</SelectItem>
              {libraryDocuments.map(item => <SelectItem key={item.id} value={item.id}><span dir="auto">{item.name}</span></SelectItem>)}
            </SelectContent>
          </Select>
        </Field>}
        {bookFile && choice && !existingDocument && <Field className="min-w-48 flex-1"><FieldLabel htmlFor="qb-document-name">Document name</FieldLabel>
          <Input id="qb-document-name" dir="auto" maxLength={255} value={choice.name} disabled={!!status} aria-invalid={!choice.name.trim() || undefined}
            onChange={event => setDocumentChoice({ ...choice, name: event.target.value })} />
        </Field>}
        {!largeBook && (!totalPages || !partialRange) && <Field className="min-w-48 flex-1"><FieldLabel htmlFor="qb-key">Answer key (optional PDF)</FieldLabel><Input key={`${fileIndex}:${bookFile?.name}:${bookFile?.lastModified}`} id="qb-key" type="file" accept=".pdf,application/pdf" disabled={!!status} onChange={e => setKeyFile(e.target.files?.[0])} /></Field>}
      </div>
      {bookFile && !inspected && <p role="status" className="text-sm">Opening PDF…</p>}
      {inspected && "error" in inspected && <Alert variant="destructive"><AlertTitle>{inspected.error}</AlertTitle></Alert>}
      {totalPages > 0 && <fieldset className="flex flex-wrap items-end gap-3" disabled={!!status}>
        <legend className="mb-2 text-sm font-medium">Page range · {totalPages} pages</legend>
        <Field className="w-28"><FieldLabel htmlFor="qb-first">First page</FieldLabel><Input id="qb-first" type="number" min={1} max={totalPages} value={range.first || ""} onChange={e => setChosenRange({
          file: bookFile, range: nextPageRange(Number(e.target.value), totalPages),
        })} /></Field>
        <Field className="w-28"><FieldLabel htmlFor="qb-last">Last page</FieldLabel><Input id="qb-last" type="number" min={range.first || 1} max={Math.min(totalPages, range.first + maxBatchPages - 1)} value={range.last || ""} onChange={e => setChosenRange({
          file: bookFile, range: { ...range, last: Number(e.target.value) },
        })} /></Field>
        {!readyToImport && <p role="status" className="text-sm text-destructive">Choose up to {maxBatchPages} consecutive pages.</p>}
      </fieldset>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!!status} onClick={() => unsaved ? setReplaceWith("sample") : openSample()}>Try sample</Button>
          <Button type="submit" variant={geminiAcademyId ? "outline" : "default"} disabled={!readyToImport || !choice?.name.trim() || !!status}><HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.5} />{geminiAcademyId ? "Extract locally" : "Extract questions"}</Button>
          {geminiAcademyId && <AlertDialog>
            <AlertDialogTrigger asChild><Button type="button" disabled={!readyToImport || !choice?.name.trim() || !!status}><HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.5} />Extract with Gemini</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Send pages to Gemini?</AlertDialogTitle>
                <AlertDialogDescription>Google receives the text or images of pages {range.first}–{range.last} from {bookFile?.name}. The separate answer key stays in Edra. Use test material approved for sharing.{unsaved && " A new review replaces your unsaved questions."}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void importFiles("gemini")}>Extract with Gemini</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>}</div>
    </form>
    <AlertDialog open={!!replaceWith} onOpenChange={open => { if (!open) setReplaceWith(undefined); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Replace the current review?</AlertDialogTitle>
          <AlertDialogDescription>Unsaved questions from the current review will be discarded when the new review opens.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep reviewing</AlertDialogCancel><AlertDialogAction onClick={() => {
          if (replaceWith === "sample") openSample();
          else if (replaceWith === "local") void importFiles();
        }}>Start new review</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </CollapsibleContent>
    </Collapsible>
    {status && <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2">
      <p role="status" className="text-sm">{status}</p>
      {importState !== "idle" && <Button size="sm" variant="outline" disabled={importState === "stopping"} onClick={() => {
        importRun.current?.abort();
        setImportState("stopping");
        setStatus("Stopping import…");
      }}>Cancel import</Button>}
    </div>}
    {saveNotice && <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">{saveNotice}
      {libraryHref && <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={libraryHref}>Open library</Link>}
    </p>}
    {error && <Alert variant="destructive"><HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} /><AlertTitle>{error}</AlertTitle></Alert>}
    {!batch || !report ? <Empty className="rounded-xl border"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={BookOpen01Icon} strokeWidth={1.5} /></EmptyMedia><EmptyTitle>No import open</EmptyTitle></EmptyHeader></Empty> : <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="max-w-full break-all pr-2 font-semibold" dir="auto">{batch.document.name}</span>
        {batch.range && <Badge variant="outline">Pages {batch.range.first}–{batch.range.last}</Badge>}
        {report.sections.length > 0 && <Badge variant="outline">{report.sections.length} sections</Badge>}
        <Badge variant="outline">{included.length} questions</Badge>
        <TopicsDialog groups={groups} assignments={assignments} existing={libraryTopics} prompt={question => edits[question.id]?.prompt ?? question.prompt}
          disabled={!!status} apply={(ids, change) => {
            const byId = new Map(included.map(question => [question.id, question]));
            setTopicEdits(previous => ({ ...previous, ...Object.fromEntries(ids.flatMap(id => {
              const question = byId.get(id);
              return question ? [[id, changeTopics(question, previous[id], change)]] : [];
            })) }));
            setTopicFilter(undefined);
          }} showInQueue={key => {
            const first = groups.find(group => group.key === key)?.questions[0];
            setTab("questions"); setTopicFilter(key); select(first ? { question: first.id } : undefined);
          }} />
        {pageIssues > 0 && <Button size="sm" variant={tab === "pages" ? "secondary" : "outline"} aria-pressed={tab === "pages"} onClick={() => { setTab("pages"); setTopicFilter(undefined); select({ issue: report.issues[0] }); }}><HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} />{pageIssues} page {pageIssues === 1 ? "issue" : "issues"}</Button>}
      </div>
      <div className="grid min-w-0 rounded-xl border bg-card xl:h-[clamp(24rem,calc(100svh-17rem),52rem)] xl:grid-cols-[minmax(11rem,0.65fr)_minmax(0,1.45fr)_minmax(0,1.35fr)] xl:divide-x">
        {tab === "pages" ? <nav aria-label="Pages with issues" className="flex min-h-0 min-w-0 flex-col gap-2 p-3">
          <Button size="sm" variant="outline" className="self-start" onClick={() => {
            setTab("questions"); select(included[0] ? { question: included[0].id } : undefined);
          }}>Back to questions</Button>
          <h2 className="mt-1 px-2 text-sm font-semibold">Page issues</h2>
          <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain xl:max-h-none">
            {issuePages.map(item => {
              const active = item.source === issue?.source && item.page === issue.page;
              return <Button key={`${item.source}:${item.page}`} className="h-auto min-h-10 w-full justify-start whitespace-normal"
                variant={active ? "secondary" : "ghost"} aria-pressed={active} onClick={() => select({ issue: item })}>
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} />{item.source} · Page {item.page}
              </Button>;
            })}
          </div>
        </nav> : <nav aria-label="Review queue" className="flex min-h-0 min-w-0 flex-col p-3">
          <div className="mb-3 flex flex-wrap gap-1">{([["questions", "All"], ["attention", `Check ${flagged}`], ["reviewed", `Reviewed ${reviewed.length}`], ...(excluded.size ? [["excluded", `Excluded ${excluded.size}`]] as const : [])] as const).map(([id, label]) => <Button key={id} size="sm" variant={tab === id && !filteredTopic ? "secondary" : "ghost"} aria-pressed={tab === id && !filteredTopic} onClick={() => { setTab(id); setTopicFilter(undefined); if (id !== tab) select(); }}>{label}</Button>)}</div>
          {tab === "questions" && filteredTopic && <div className="mb-2 flex flex-wrap items-center gap-1">
            <Badge variant="outline" dir="auto">{filteredTopic.label ?? "Unassigned"}</Badge>
            <Button size="sm" variant="ghost" onClick={() => setTopicFilter(undefined)}>Clear topic</Button>
          </div>}
          <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain xl:max-h-none">
            {visibleQuestions.map(item => <Button key={item.id} aria-label={`Question ${item.number}${item.section ? `, ${item.section}` : ""}, page ${item.page}`} aria-pressed={item.id === q?.id} variant={item.id === q?.id ? "secondary" : "ghost"} className="h-auto min-h-11 w-full justify-start whitespace-normal" onClick={() => select({ question: item.id })}>
              <HugeiconsIcon icon={edits[item.id]?.reviewed ? Tick02Icon : item.issues.length ? Alert02Icon : File01Icon} strokeWidth={1.5} />
              <span className="min-w-0 text-left">Question {item.number}<span className="block text-xs font-normal text-muted-foreground">{item.section && <><span dir="auto">{item.section}</span> · </>}Page {item.page}</span></span>
            </Button>)}
            {!visibleQuestions.length && <p className="px-2 py-3 text-sm text-muted-foreground">{batch.extracted && tab === "questions" ? "No exercises extracted" : "No items in this view"}</p>}
          </div>
        </nav>}
        <section aria-label="Original document" className="flex min-h-0 min-w-0 flex-col border-y xl:border-y-0">
          <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2">
            <span className="mr-auto min-w-0 break-words text-sm font-semibold">{keyVisible ? shownSource?.name ?? "Answer key" : "Original document"}</span>
            {shownPage && <Badge variant="outline">Page {shownPage}</Badge>}
            {!!region?.crop && !keyVisible && !issue && <Button variant="ghost" size="sm" onClick={() => setFullPage(v => !v)}>{fullPage ? "Show excerpt" : "Full page"}</Button>}
            {q && e && !excluded.has(q.id) && !keyVisible && page?.image && <CropDialog key={`${q.id}:${page.number}`} source={page.image} page={page.number} excerpt={region?.crop} disabled={!!status}
              onSave={visual => patch({ visuals: [...e.visuals, { ...visual, id: ++nextVisualId.current }] })} />}
          </div>
          {regions.length > 1 && !keyVisible && <div className="flex flex-wrap gap-1 border-b px-3 py-2" aria-label="Question source pages">
            {regions.map((item, index) => <Button key={item.page} size="sm" variant={index === sourceIndex ? "secondary" : "ghost"} aria-pressed={index === sourceIndex} onClick={() => { setSourceIndex(index); setFullPage(false); }}>{q && item.page < q.page ? "Previous page · " : "Page "}{item.page}</Button>)}
          </div>}
          <div key={`${keyVisible}:${shownPage}:${crop?.top ?? "full"}`} className="max-h-[60svh] min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/50 p-3 xl:max-h-none"><SourcePreview page={page} crop={crop} /></div>
        </section>
        <section aria-label={tab === "pages" ? "Page issue details" : "Question review"} className="flex min-h-0 min-w-0 flex-col">
          {q && e ? <>
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 py-2"><h2 className="font-heading text-base font-semibold">Question {q.number}</h2><Badge variant={e.reviewed && !excluded.has(q.id) ? "default" : "secondary"}>{excluded.has(q.id) ? "Excluded" : e.reviewed ? "Reviewed" : "Draft"}</Badge></div>
            <div key={q.id} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            {assignments.has(q.id) && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Topics</span>
              {assignments.get(q.id)!.map(topic => <Badge key={topic.label} variant={topic.verification === "suggested" ? "outline" : "secondary"} dir="auto">
                {topic.label}{topic.verification === "suggested" && " · Suggested"}
              </Badge>)}
            </div>}
            {q.issues.length > 0 && !e.reviewed && <Alert><HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} /><AlertTitle>Needs a check</AlertTitle><AlertDescription><ul className="list-disc pl-4">{q.issues.map(reason => <li key={reason}>{reason}</li>)}</ul></AlertDescription></Alert>}
            <QuestionTextField id="qb-prompt" label="Prompt" multiline value={e.prompt} error={promptMathError}
              normalize={value => normalizePrompt(value, q.number)} onChange={prompt => patch({ prompt })} />
            {e.visuals.length > 0 && <div className="space-y-2">
              <h3 className="text-sm font-medium">Visual attachments</h3>
              {e.visuals.map(visual => {
                const original = batch.book.pages.find(p => p.number === visual.page)?.image;
                return <figure key={visual.id} className="overflow-hidden rounded-lg border">
                  <div className="bg-muted/40 p-2"><AttachmentPreview image={visual.image} description={visual.description} /></div>
                  <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t p-2">
                    <span className="mr-auto min-w-0 break-words text-sm" dir="auto">{visual.description} <span className="text-muted-foreground">· p. {visual.page}</span></span>
                    {!excluded.has(q.id) && <>
                      {original && <CropDialog source={original} page={visual.page} initial={visual} disabled={!!status}
                        onSave={next => patch({ visuals: e.visuals.map(item => item.id === visual.id ? { ...next, id: item.id } : item) })} />}
                      <Button variant="ghost" size="sm" aria-label={`Remove image: ${visual.description}`} disabled={!!status} onClick={() => patch({ visuals: e.visuals.filter(item => item.id !== visual.id) })}>Remove</Button>
                    </>}
                  </figcaption>
                </figure>;
              })}
            </div>}
            {e.choices.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Choices</p>
              {e.choices.map((choice, index) => <div className="flex min-w-0 items-center gap-2" key={index}>
                <Badge className="w-7 shrink-0 justify-center" variant={e.answer === choice.key ? "default" : "outline"}>{choice.key}</Badge>
                <div className="min-w-0 flex-1">
                  <QuestionTextField id={`qb-choice-${index}`} label={`Choice ${choice.key}`} value={choice.text} error={choiceMathErrors[index]}
                    onChange={text => patch({ choices: e.choices.map((c, i) => i === index ? { ...c, text } : c) })} />
                </div>
                <Button size="sm" variant="ghost" aria-pressed={e.answer === choice.key} aria-label={`Confirm choice ${choice.key} as the answer`} disabled={e.choices.filter(c => c.key === choice.key).length > 1} onClick={() => {
                  const answer = e.answer === choice.key ? null : choice.key;
                  patch({ answer, answerSource: (keyVisible || q.answer?.marked) && answer && q.answer?.key === answer && answerDocument ? { file: answerDocument.name, page: q.answer.page } : undefined });
                }}><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} /></Button>
              </div>)}
            </div>}
            {q.answer && <div className="flex flex-wrap gap-2">
              <Button className="max-w-full" variant="outline" size="sm" aria-pressed={keyVisible} onClick={() => setKeyVisible(!keyVisible)}>{keyVisible ? "Show question page" : q.answer.marked ? `Marked in PDF: ${q.answer.key} · Page ${q.answer.page}` : `Suggested key: ${q.answer.key} · Answer page ${q.answer.page}`}</Button>
              {q.answer.marked && e.answer !== q.answer.key && !excluded.has(q.id) && <Button type="button" size="sm" variant="secondary" onClick={() => {
                const suggestion = q.answer!;
                patch({ answer: suggestion.key, answerSource: { file: batch.book.name, page: suggestion.page } });
              }}>Confirm suggested answer</Button>}
            </div>}
            {!q.answer && e.choices.length > 0 && <p className="text-sm text-muted-foreground">No matching answer suggested</p>}
            {e.choices.length > 0 && <p className="text-sm text-muted-foreground">{e.answer ? `Confirmed answer: ${e.answer}` : "No answer confirmed"}</p>}
            {!e.choices.length && <QuestionTextField id="qb-model-answer" label="Model answer" multiline value={e.modelAnswer} error={answerMathError} onChange={modelAnswer => patch({ modelAnswer })} />}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <Button variant="ghost" disabled={!!status} onClick={toggleExcluded}>{excluded.has(q.id) ? "Restore question" : "Exclude question"}</Button>
              {!excluded.has(q.id) && <Button disabled={!e.prompt.trim() || e.reviewed || invalidMath || !!status || (e.choices.length > 0 && (e.choices.length < 2 || new Set(e.choices.map(c => c.key)).size !== e.choices.length || e.choices.some(c => !c.text.trim())))} onClick={() => patch({ prompt: normalizePrompt(e.prompt, q.number), choices: e.choices.map(c => ({ ...c, text: normalizeMathSource(c.text) })), modelAnswer: normalizeMathSource(e.modelAnswer), answer: e.answer, answerSource: e.answerSource, reviewed: true })}><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} />{e.reviewed ? "Reviewed" : "Mark reviewed"}</Button>}
            </div>
          </> : issue ? <div className="min-h-0 space-y-4 overflow-auto p-4">
            <h2 className="font-heading text-lg font-semibold">{issue.source} · Page {issue.page}</h2>
            <Alert><HugeiconsIcon icon={Alert02Icon} strokeWidth={1.5} /><AlertTitle>{selectedPageIssues.length === 1 ? selectedPageIssues[0].reason : "Issues on this page"}</AlertTitle>
              {selectedPageIssues.length > 1 && <AlertDescription><ul className="list-disc pl-4">{[...new Set(selectedPageIssues.map(item => item.reason))].map(reason => <li key={reason}>{reason}</li>)}</ul></AlertDescription>}
            </Alert>
            {geminiAcademyId && !batch.extracted && issue.source === "Book" && page?.mode === "scan" && page.image &&
              batch.file && batch.file === bookFile && <Button variant="outline" disabled={!!status} onClick={() => {
                setChosenRange({ file: bookFile, range: { first: issue.page, last: issue.page } });
                setImportOpen(true);
                requestAnimationFrame(() => document.getElementById("qb-book")?.scrollIntoView?.({ block: "nearest" }));
              }}>Open page {issue.page} for visual extraction</Button>}
            {geminiAcademyId && issue.source === "Book" && failedPages.includes(issue.page) && <Button variant="outline" disabled={!!status} onClick={() => void retryGemini(issue.page)}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} />Retry page {issue.page} with Gemini</Button>}
            {retryableIssue && issue.source === "Answer key" && <Button variant="outline" disabled={!!status} onClick={() => void retry(retryableIssue)}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} />Retry this page</Button>}
          </div> : <Empty><EmptyHeader><EmptyTitle>Select a question or page</EmptyTitle></EmptyHeader></Empty>}
        </section>
      </div>
    </>}
  </main>;
}

function BankSave({ scope, ...props }: Omit<Parameters<typeof AssignUnits>[0], "academyId" | "accountId"> & { scope: BankScope }) {
  const queryClient = useQueryClient();
  return <AssignUnits {...props} academyId={scope.academyId} accountId={scope.accountId} onSave={async selection => {
    const error = await props.onSave(selection);
    // New questions change counts and lists; existing details are unaffected.
    if (!error) {
      void queryClient.invalidateQueries({ queryKey: bankKeys.collections(scope) });
      void queryClient.invalidateQueries({ queryKey: bankKeys.lists(scope) });
    }
    return error;
  }} />;
}
