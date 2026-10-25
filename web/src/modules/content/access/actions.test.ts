import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), signed: vi.fn(), bucket: vi.fn(), token: vi.fn(), admin: vi.fn(), caller: vi.fn() }));
vi.mock("./data", () => ({ learningCaller: mocks.caller, readAccessHistory: vi.fn(), readAccessWorkspace: vi.fn(), readLearningList: vi.fn(), readLearningUnit: vi.fn() }));
vi.mock("../data", () => ({ contentCaller: mocks.caller, contentResult: async (run: () => Promise<unknown>) => {
  try { return { ok: true, value: await run() }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Failed" }; }
} }));
vi.mock("../media", () => ({ mediaAdmin: mocks.admin }));
vi.mock("@/lib/video/mux", () => ({ playbackToken: mocks.token }));
import { grantUnitAccess, openLearningMaterial, redeemUnitCode } from "./actions";
const academyId = "10000000-0000-4000-8000-000000000001", unitId = "10000000-0000-4000-8000-000000000002", itemId = "10000000-0000-4000-8000-000000000003";
const requestId = "10000000-0000-4000-8000-000000000004", recordId = "10000000-0000-4000-8000-000000000005";
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(1800000000000);
  mocks.caller.mockResolvedValue({ db: { rpc: mocks.rpc }, userId: recordId });
  mocks.admin.mockReturnValue({ storage: { from: mocks.bucket } }); mocks.bucket.mockReturnValue({ createSignedUrl: mocks.signed });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://private.invalid/signed" }, error: null });
  mocks.token.mockImplementation((_id, audience, deadline) => ({ token: audience, expires: deadline }));
});
afterEach(() => vi.restoreAllMocks());
describe("student material authority", () => {
  const input = { academyId, unitId, itemId };
  it("does not sign any media when the database rejects access", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "access_required" } });
    expect(await openLearningMaterial(input)).toEqual({ ok: false, message: "Active unit access is required." });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled();
  });
  it("caps every video audience at the authorized grant expiry", async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { kind: "video", playbackId: "published-video", storagePath: null, expiresAt: new Date(1800000060000).toISOString() } });
    expect(await openLearningMaterial(input)).toMatchObject({ ok: true, value: { kind: "video", token: "v", thumbnailToken: "t", storyboardToken: "s", expires: 1800000060 } });
    expect(mocks.rpc).toHaveBeenCalledWith("authorize_content_material", { p_academy_id: academyId, p_unit_id: unitId, p_item_id: itemId });
    expect(mocks.token.mock.calls).toEqual([ ["published-video", "v", 1800000060], ["published-video", "t", 1800000060], ["published-video", "s", 1800000060] ]);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([60, 3600])("caps private document links at remaining access and two minutes (%s seconds)", async seconds => {
    mocks.rpc.mockResolvedValue({ error: null, data: { kind: "document", playbackId: null, storagePath: "academy/private.pdf", expiresAt: new Date(1800000000000 + seconds * 1000).toISOString() } });
    const result = await openLearningMaterial(input);
    expect(result).toMatchObject({ ok: true, value: { kind: "document", expires: 1800000000 + Math.min(seconds, 120) } });
    expect(mocks.bucket).toHaveBeenCalledWith("content-documents");
    expect(mocks.signed).toHaveBeenCalledWith("academy/private.pdf", Math.min(seconds, 120));
  });
  it("refuses expired authorization and provider failures", async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { kind: "document", playbackId: null, storagePath: "private.pdf", expiresAt: new Date(1799999999000).toISOString() } });
    expect(await openLearningMaterial(input)).toMatchObject({ ok: false, message: "Your access has expired." });
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ error: null, data: { kind: "document", playbackId: null, storagePath: "private.pdf", expiresAt: new Date(1800000060000).toISOString() } });
    mocks.signed.mockResolvedValue({ error: { message: "provider" }, data: null });
    expect(await openLearningMaterial(input)).toMatchObject({ ok: false, message: "Could not open this document. Please retry." });
  });
});
it("normalizes a unit code and preserves the retry request without accepting a duration override", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "code_used" }, data: null });
  await redeemUnitCode({ academyId, unitId, requestId, code: "ab7k-9m3r", duration: 90 });
  expect(mocks.rpc).toHaveBeenCalledWith("redeem_content_coupon", { p_academy_id: academyId, p_unit_id: unitId, p_request_id: requestId, p_code: "AB7K9M3R" });
});
it("binds a staff confirmation to the reviewed grant and publication", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "content_conflict" }, data: null });
  expect(await grantUnitAccess({ academyId, unitId, requestId, recordId, expectedGrantId: null, expectedRevision: 3 })).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
  expect(mocks.rpc).toHaveBeenCalledWith("confirm_content_access", { p_academy_id: academyId, p_unit_id: unitId, p_record_id: recordId, p_request_id: requestId, p_expected_grant_id: null, p_expected_revision: 3 });
});
it("reports returned coupon denials without treating them as a successful grant", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: { error: "prerequisites_required" } });
  expect(await redeemUnitCode({ academyId, unitId, requestId, code: "ab7k-9m3r" })).toEqual({ ok: false, message: "Complete this unit’s unlock and submission requirements first." });
  expect(mocks.rpc).toHaveBeenCalledWith("redeem_content_coupon", { p_academy_id: academyId, p_unit_id: unitId, p_request_id: requestId, p_code: "AB7K9M3R" });
});
