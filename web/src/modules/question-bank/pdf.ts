import type { SourcePage } from "./parser";
import { isYellowHighlight, readMarkedChoices } from "./marked-choices";
import { readTextLayer } from "./pdf-text";
import { maxBatchPages, maxBookBytes, maxBookPages, maxKeyBytes, validPageRange, type PageRange } from "./import-limits";

function isBlankCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 16 && Math.min(data[i], data[i + 1], data[i + 2]) < 247 && ++ink === 16) return false;
  }
  return true;
}

type Recognizer = { read: (image: Blob) => Promise<string>; close: () => Promise<unknown> };

async function recognizer(): Promise<Recognizer> {
  const [{ createWorker, OEM }, { default: workerPath }, { default: corePath }] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-lstm.wasm.js?url"),
  ]);
  const worker = await createWorker(["ara", "eng"], OEM.LSTM_ONLY, { workerPath, corePath, workerBlobURL: false });
  return {
    async read(image) { return (await worker.recognize(image)).data.text; },
    close: () => worker.terminate(),
  };
}

async function scan(page: SourcePage, engine: Recognizer): Promise<SourcePage> {
  if (!page.image) return page;
  const text = (await engine.read(page.image)).trim();
  return { ...page, mode: "scan", text, lineTops: undefined, error: text.replace(/\s/g, "").length < 16 ? "Page is blank or too difficult to read" : undefined };
}

export async function retryPage(page: SourcePage): Promise<SourcePage> {
  const engine = await recognizer();
  try { return await scan(page, engine); } finally { await engine.close(); }
}

async function openPdf(file: File, maxBytes: number) {
  if (file.size > maxBytes) throw new Error(`Choose a PDF up to ${maxBytes / (1024 * 1024)} MB.`);
  const [pdfjs, { default: workerUrl }, { PdfDecoderAssets }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("./pdf-decoders"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // Resize large scans in the worker rather than silently dropping them.
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
    BinaryDataFactory: PdfDecoderAssets,
    useWorkerFetch: false,
  });
  return { pdfjs, task };
}

export async function inspectPdf(file: File) {
  const { task } = await openPdf(file, maxBookBytes);
  try {
    const { numPages } = await task.promise;
    if (numPages > maxBookPages) throw new Error(`Choose a PDF with up to ${maxBookPages} pages.`);
    return numPages;
  } finally { await task.destroy(); }
}

export async function readPdf(file: File, progress: (page: number, total: number, scanning: boolean) => void, mode: "local" | "gemini" | "answer-key" = "local", range?: PageRange, signal?: AbortSignal) {
  const { pdfjs, task } = await openPdf(file, range ? maxBookBytes : maxKeyBytes);
  let engine: Promise<Recognizer> | undefined;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > maxBookPages) throw new Error(`Choose a PDF with up to ${maxBookPages} pages.`);
    const selected = range ?? { first: 1, last: pdf.numPages };
    if (!validPageRange(selected, pdf.numPages)) throw new Error(`Choose a PDF page range of up to ${maxBatchPages} pages.`);
    const pages: SourcePage[] = [];
    for (let number = selected.first; number <= selected.last; number++) {
      signal?.throwIfAborted();
      const result: SourcePage = { number, text: "", mode: "text" };
      progress(number, pdf.numPages, false);
      try {
        const page = await pdf.getPage(number);
        const canvas = document.createElement("canvas");
        try {
          const size = page.getViewport({ scale: 1 });
          // Match TeacherGen's 200 dpi transcription input, bounded for browser memory.
          const viewport = page.getViewport({ scale: Math.min(200 / 72, 2400 / Math.max(size.width, size.height)) });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const annotationMode = mode === "gemini" ? pdfjs.AnnotationMode.ENABLE : pdfjs.AnnotationMode.DISABLE;
          await page.render({ canvas, viewport, annotationMode }).promise;
          result.blankImage = isBlankCanvas(canvas);
          if (result.blankImage) {
            result.error = "Page rendered blank. Compare it with the original PDF.";
            pages.push(result);
            continue;
          }
          result.image = await new Promise<Blob | undefined>(resolve => canvas.toBlob(b => resolve(b ?? undefined), "image/jpeg", 0.91));
          try {
            const layer = await page.getTextContent();
            Object.assign(result, readTextLayer(layer.items, item => {
              if (page.rotate !== 0 || Math.abs(item.transform[1]) > 0.01 || Math.abs(item.transform[2]) > 0.01) return null;
              const [, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
              return (baseline - item.height * viewport.scale) / viewport.height;
            }));
            const ctx = mode === "gemini" && page.rotate === 0 ? canvas.getContext("2d") : null;
            if (ctx) {
              const words = layer.items.flatMap(item => {
                if (!("str" in item) || !item.str.trim() || Math.abs(item.transform[1]) > 0.01 || Math.abs(item.transform[2]) > 0.01) return [];
                const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
                return [{ text: item.str, x, baseline, width: item.width * viewport.scale, height: item.height * viewport.scale }];
              });
              result.markedChoices = readMarkedChoices(words, word => isYellowHighlight(ctx, word));
            }
          } catch {
            // A damaged text layer can still have a usable rendered page.
          }
          if (mode !== "answer-key") {
            // Tables and figures can be present even when the PDF has an excellent text layer.
            // Prefer vision for image objects or repeated vector drawing operations.
            try {
              const [{ fnArray, argsArray }, annotations] = await Promise.all([page.getOperatorList({ annotationMode }), page.getAnnotations({ intent: "display" })]);
              const ops = pdfjs.OPS;
              const imageOps = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintInlineImageXObjectGroup, ops.paintImageXObjectRepeat, ops.paintImageMaskXObject, ops.paintImageMaskXObjectGroup, ops.paintImageMaskXObjectRepeat, ops.paintFormXObjectBegin]);
              const hasImage = fnArray.some(op => imageOps.has(op));
              // A searchable scan can have a text layer that was already generated by OCR.
              // If all printed text operations are invisible, use the visible scan as evidence.
              if (hasImage) {
                let textMode = 0, invisibleText = false, visibleText = false;
                const modes: number[] = [];
                for (const [index, op] of fnArray.entries()) {
                  if (op === ops.save) modes.push(textMode);
                  else if (op === ops.restore) textMode = modes.pop() ?? 0;
                  else if (op === ops.setTextRenderingMode) textMode = Number(argsArray[index]?.[0]);
                  else if (op === ops.showText || op === ops.showSpacedText) {
                    if (textMode === 3 || textMode === 7) invisibleText = true;
                    else visibleText = true;
                  }
                }
                if (invisibleText && !visibleText) result.mode = "scan";
              }
              const tops = result.lineTops?.filter((top): top is number => top !== null) ?? [];
              const nonLinear = tops.some((top, i) => i > 0 && tops[i - 1] - top > 0.12);
              result.preferImage = page.rotate !== 0 || nonLinear || result.markedChoices?.some(group => group.markedKeys.length > 0) ||
                annotations.some(annotation => annotation.subtype === "Highlight") ||
                hasImage || fnArray.includes(ops.constructPath);
            } catch { result.preferImage = true; }
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
        // Continuation pages and answer keys may have no question heading at all.
        const readable = !/\uFFFD/.test(result.text)
          && (result.text.replace(/\s/g, "").length >= 24 || /\p{L}{2,}/u.test(result.text));
        if (!readable) { result.preferImage = true; result.mode = "scan"; }
        if (mode === "answer-key" && !readable && result.image) {
          progress(number, pdf.numPages, true);
          try {
            engine ??= recognizer();
            pages.push(await scan(result, await engine));
            continue;
          } catch {
            result.error = "Couldn’t run local OCR for this page";
          }
        }
        if (!result.image && !result.text) result.error = "Couldn’t read this page";
      } catch {
        result.error = "Couldn’t open this page";
      }
      pages.push(result);
    }
    signal?.throwIfAborted();
    return pages;
  } finally {
    await task.destroy();
    if (engine) await engine.then(ocr => ocr.close(), () => undefined);
  }
}
