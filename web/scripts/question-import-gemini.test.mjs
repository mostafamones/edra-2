import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import { reviewWithGemini } from "./question-import-gemini.mjs";

const schema = z.object({
  questions: z.array(z.object({
    page: z.number(), continuationPages: z.array(z.number()), visuals: z.array(z.object({ page: z.number() })),
  })),
});
const options = { apiKey: "fixture", pdf: Buffer.from("synthetic PDF"), pageCount: 2, prompt: "Find exercises", schema };
function reply(questions) {
  return Response.json({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ questions }) }] } }],
    usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 42 },
  });
}

test("passes original document bytes and preserves result and token usage", async () => {
  const questions = [{ page: 1, continuationPages: [2], visuals: [{ page: 2 }] }];
  const result = await reviewWithGemini({ ...options, fetcher: async (url, init) => {
    assert.equal(new URL(url).hostname, "generativelanguage.googleapis.com");
    assert.equal(new URL(url).search, "");
    const data = JSON.parse(init.body);
    assert.equal(data.contents[0].parts[0].inlineData.data, options.pdf.toString("base64"));
    assert.equal(data.contents[0].parts[1].text, options.prompt);
    return reply(questions);
  } });
  assert.deepEqual(result.questions, questions);
  assert.deepEqual(result.usage, { inputTokens: 123, outputTokens: 42, thinkingTokens: null });
});

test("does not score an incomplete reply or a question referring to a nonexistent page", async () => {
  await assert.rejects(reviewWithGemini({ ...options, fetcher: async () =>
    Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
  }), /did not complete/);
  await assert.rejects(reviewWithGemini({ ...options, fetcher: async () =>
    reply([{ page: 3, continuationPages: [], visuals: [] }]),
  }), /invalid source-page reference/);
});
