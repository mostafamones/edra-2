import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationRow } from "./types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), links: vi.fn() }));
vi.mock("../../lib/supabase/client", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("./actions", () => ({ getStaffInvitationLinks: mocks.links }));

import { fetchAllInvitations } from "./queries";

const academyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function row(index: number, status: InvitationRow["status"] = "revoked"): InvitationRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    phone: "+201011111111",
    role: "instructor",
    status,
    createdAt: new Date(Date.UTC(2026, 9, index)).toISOString(),
    expiresAt: new Date(Date.UTC(2026, 9, index + 7)).toISOString(),
    acceptedAt: null,
    revokedAt: status === "revoked" ? new Date(Date.UTC(2026, 9, index + 1)).toISOString() : null,
    createdByName: "Owner",
    acceptedByName: null,
    revokedByName: null,
    canManage: status === "pending",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.links.mockResolvedValue({ ok: true, links: {} });
});

describe("invitation list queries", () => {
  it("sorts oldest first across all database pages, including history with no copy links", async () => {
    const newestFirst = Array.from({ length: 21 }, (_, index) => row(21 - index));
    mocks.rpc.mockResolvedValueOnce({ data: { rows: newestFirst.slice(0, 20), total: 21 }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: { rows: newestFirst.slice(20), total: 21 }, error: null });

    const result = await fetchAllInvitations(academyId, "revoked");

    expect(result.map((invite) => invite.id)).toEqual([...newestFirst].reverse().map((invite) => invite.id));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "list_staff_invitations", expect.objectContaining({ p_status: "revoked", p_page_index: 1 }));
    expect(mocks.links).not.toHaveBeenCalled();
  });

  it("loads all statuses using SQL null and prepares only manageable pending links", async () => {
    const pending = row(2, "pending");
    const revoked = row(1);
    const link = "https://edra.example/invite/staff/replacement";
    mocks.rpc.mockResolvedValue({ data: { rows: [pending, revoked], total: 2 }, error: null });
    mocks.links.mockResolvedValue({ ok: true, links: { [pending.id]: link } });

    const result = await fetchAllInvitations(academyId, "all");

    expect(mocks.rpc).toHaveBeenCalledWith("list_staff_invitations", expect.objectContaining({ p_status: null }));
    expect(mocks.links).toHaveBeenCalledWith(academyId, [pending.id]);
    expect(result.map((invite) => [invite.id, invite.invitationLink])).toEqual([[revoked.id, null], [pending.id, link]]);
  });

  it("surfaces failed status requests instead of returning cards for another filter", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Could not load revoked invitations" } });

    await expect(fetchAllInvitations(academyId, "revoked")).rejects.toThrow("Could not load revoked invitations");
    expect(mocks.links).not.toHaveBeenCalled();
  });
});
