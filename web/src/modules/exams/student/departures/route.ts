import "server-only";
import { z } from "zod";
import { platformOrigin } from "@/lib/routing";
import { recordMyExamDeparture } from "../data";

const input = z.object({ academyId: z.uuid(), token: z.string().regex(/^[0-9a-f]{64}$/), generation: z.number().int().positive().max(2147483647),
  eventId: z.uuid(), questionId: z.uuid().nullable() }).strict();
const headers = { "Cache-Control": "private, no-store" };
export async function departurePost(request: Request, examId: string) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  if (request.headers.get("origin") !== platformOrigin("student") || request.headers.get("sec-fetch-site") === "cross-site"
    || request.headers.has("authorization")) return reply({ ok: false }, 403);
  if (!z.uuid().safeParse(examId).success || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({ ok: false }, 400);
  // Bound the actual stream, including chunked bodies; Content-Length alone is untrusted.
  const reader = request.body?.getReader();
  if (!reader) return reply({ ok: false }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply({ ok: false }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = input.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return reply({ ok: false }, 400);
    const result = await recordMyExamDeparture({ ...parsed.data, examId });
    // Teardown carries receipts only, never state, questions, answers, or results.
    return result.ok ? reply({ ok: true, kind: result.kind, departure: "departure" in result ? result.departure : null }, 200)
      : reply({ ok: false, code: result.code }, result.code === "forbidden" ? 403 : 400);
  } catch { return reply({ ok: false }, 400); }
}
