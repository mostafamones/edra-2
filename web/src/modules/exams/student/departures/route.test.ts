import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/routing", () => ({ platformOrigin: () => "https://learn.example.com" }));
const api = vi.hoisted(() => ({ departure: vi.fn() }));
vi.mock("../data", () => ({ recordMyExamDeparture: api.departure }));
import { departurePost } from "./route";
const id = "12345678-1234-4123-8123-123456789012";
const payload = { academyId: id, token: "a".repeat(64), generation: 1, eventId: id, questionId: null };
const request = (body: unknown = payload, headers: Record<string, string> = {}) => new Request(`https://learn.example.com/api/student/exams/${id}/departure`, {
  method: "POST", headers: { Origin: "https://learn.example.com", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
beforeEach(() => api.departure.mockReset());
describe("cookie departure transport", () => {
  it("uses the fenced service and returns no state or material", async () => {
    api.departure.mockResolvedValue({ ok: true, kind: "warned", departure: null, state: { answers: "SECRET" } });
    const response = await departurePost(request(), id);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, kind: "warned", departure: null });
    expect(api.departure).toHaveBeenCalledWith({ ...payload, examId: id });
  });
  it.each<Record<string, string>>([{ Origin: "https://evil.example.com" }, { "Sec-Fetch-Site": "cross-site" }, { Authorization: "Bearer forbidden" }])("rejects foreign or mixed authority %j", async (headers) => {
    expect((await departurePost(request(payload, headers), id)).status).toBe(403);
    expect(api.departure).not.toHaveBeenCalled();
  });
  it.each([{ ...payload, token: "invalid" }, { ...payload, generation: 0 }, { ...payload, questionId: "invalid" }, { ...payload, extra: true }])("rejects invalid bodies", async (body) => {
    expect((await departurePost(request(body), id)).status).toBe(400); expect(api.departure).not.toHaveBeenCalled();
  });
  it("bounds body bytes even without Content-Length", async () => {
    expect((await departurePost(request({ padding: "x".repeat(2100) }), id)).status).toBe(413);
    expect(api.departure).not.toHaveBeenCalled();
  });
  it("preserves ordinary service authorization failures", async () => {
    api.departure.mockResolvedValue({ ok: false, code: "forbidden", message: "private" });
    expect((await departurePost(request(), id)).status).toBe(403);
  });
});
