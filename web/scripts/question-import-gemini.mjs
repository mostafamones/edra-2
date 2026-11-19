export const geminiModel = "gemini-3.5-flash-lite";
export const geminiMaxPages = 12;
export const geminiMaxBytes = 4 * 1024 * 1024;

export async function reviewWithGemini({ apiKey, pdf, prompt, schema, pageCount, fetcher = fetch }) {
  if (!apiKey?.trim()) throw new Error("Set GEMINI_API_KEY using a Gemini Free Tier project.");
  if (pdf.length > geminiMaxBytes || pageCount < 1 || pageCount > geminiMaxPages) {
    throw new Error("Gemini benchmark accepts PDFs up to 12 pages and 4 MiB.");
  }
  const responseJsonSchema = schema.toJSONSchema();
  delete responseJsonSchema.$schema;
  const started = Date.now();
  const reply = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "LOW" } },
    }),
  });
  if (!reply.ok) throw new Error(`Gemini returned HTTP ${reply.status}${reply.status === 429 ? " (project quota or rate limit)" : ""}.`);
  const body = await reply.json();
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw new Error("Gemini did not complete the review.");
  const output = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("");
  let parsed;
  try { parsed = schema.safeParse(JSON.parse(output)); } catch { /* Invalid JSON. */ }
  if (!parsed?.success) throw new Error("Gemini returned an invalid question review.");
  if (parsed.data.questions.some(q => q.page > pageCount
    || (q.answer && (q.kind !== "multiple-choice" || q.answer.page > pageCount))
    || q.continuationPages.some(page => page <= q.page || page > pageCount)
    || q.visuals.some(visual => visual.page !== q.page && !q.continuationPages.includes(visual.page)))) {
    throw new Error("Gemini returned an invalid source-page reference.");
  }
  return {
    questions: parsed.data.questions,
    durationMs: Date.now() - started,
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? null,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
      thinkingTokens: body.usageMetadata?.thoughtsTokenCount ?? null,
    },
  };
}
