import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claims: vi.fn(), cookies: vi.fn(), publicPath: vi.fn(), academies: vi.fn(), suspended: vi.fn(), removed: vi.fn(), student: vi.fn(),
}));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/server/request", () => ({ cookies: mocks.cookies, headers: async () => ({ get: mocks.publicPath }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims } }) }));
vi.mock("@/modules/academies/server", () => ({ listStaffAcademies: mocks.academies, listSuspendedStaffAcademies: mocks.suspended, wasRemovedFromAcademy: mocks.removed }));
vi.mock("@/modules/students/server", () => ({ getStudentProfile: mocks.student }));
vi.mock("@/modules/academies/profile/server", () => ({ getAcademyProfile: vi.fn() }));
vi.mock("@/modules/academies/structure/server", () => ({ getStructure: vi.fn() }));
vi.mock("@/lib/routing", () => ({
  PUBLIC_PATH_HEADER: "x-edra-public-path",
  validAcademySlug: (slug: string) => /^[a-z]+$/.test(slug),
  staffAcademyHref: (slug: string, path = "") => `https://staff.test/${slug}${path}`,
  staffEntryHref: () => "https://staff.test/", studentHref: () => "https://student.test/",
}));
import { staffAcademy, staffEntry } from "./staff.server";

describe("staff route server guards", () => {
  it.each(["otp", "recovery", "magiclink", undefined])("rejects %s sessions before reading staff memberships", async method => {
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "user", amr: method ? [{ method }] : undefined } } });
    await expect(staffEntry("/?q=a%2Fb")).rejects.toThrow("redirect:/auth/login?next=%2F%3Fq%3Da%252Fb");
    expect(mocks.academies).not.toHaveBeenCalled();
    expect(mocks.student).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "user", amr: [{ method: "password" }] } } });
    mocks.publicPath.mockReturnValue(null);
    mocks.cookies.mockResolvedValue({ get: (name: string) => name === "edra_last_academy_slug" ? { value: "second" } : undefined });
    mocks.academies.mockResolvedValue([{ slug: "first", name: "First" }, { slug: "second", name: "Second" }]);
    mocks.suspended.mockResolvedValue([]); mocks.removed.mockResolvedValue(false);
    mocks.student.mockResolvedValue({ data: null, error: null });
  });
  it("selects the remembered academy and preserves legacy paths and queries", async () => {
    await expect(staffEntry("/app/students/abc?from=a%2Fb")).rejects.toThrow("redirect:https://staff.test/second/students/abc?from=a%2Fb");
    await expect(staffEntry("/app?x=1")).rejects.toThrow("redirect:https://staff.test/second?x=1");
    await expect(staffEntry("/other?q=1")).rejects.toThrow("redirect:https://staff.test/second");
  });
  it("restores the legacy path from the gateway header, ignoring server-function paths", async () => {
    mocks.publicPath.mockReturnValue("/app/students/abc?from=x");
    await expect(staffEntry("/?from=x")).rejects.toThrow("redirect:https://staff.test/second/students/abc?from=x");
    mocks.publicPath.mockReturnValue("/_serverFn/id");
    await expect(staffEntry("/")).rejects.toThrow("redirect:https://staff.test/second");
  });
  it("falls back to the first staff academy or a verified student", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    await expect(staffEntry("/")).rejects.toThrow("redirect:https://staff.test/first");
    mocks.academies.mockResolvedValue([]);
    mocks.student.mockResolvedValue({ data: { level_id: "level", parent_phone_verified_at: "now" }, error: null });
    await expect(staffEntry("/")).rejects.toThrow("redirect:https://student.test/");
    mocks.student.mockResolvedValue({ data: null, error: null });
    await expect(staffEntry("/")).rejects.toThrow("redirect:/onboarding");
  });
  it("encodes the public return path for unauthenticated users", async () => {
    mocks.claims.mockResolvedValue({ data: null });
    await expect(staffEntry("/app/a?x=1&y=2")).rejects.toThrow("redirect:/auth/login?next=%2Fapp%2Fa%3Fx%3D1%26y%3D2");
    expect(mocks.academies).not.toHaveBeenCalled();
  });
  it("returns suspended access and redirects removed members", async () => {
    mocks.academies.mockResolvedValue([]); mocks.suspended.mockResolvedValue([{ slug: "locked", name: "Locked" }]);
    expect(await staffEntry("/")).toEqual({ academyName: "Locked", retryHref: "https://staff.test/", otherAcademies: false });
    expect(await staffAcademy("locked")).toMatchObject({ status: "suspended", academyName: "Locked", otherAcademies: false });
    mocks.suspended.mockResolvedValue([]); mocks.removed.mockResolvedValue(true);
    await expect(staffAcademy("removed")).rejects.toThrow("redirect:/onboarding/instructor/join");
  });
  it("rejects invalid slugs before querying memberships", async () => {
    await expect(staffAcademy("bad/slug")).rejects.toThrow("notFound");
    expect(mocks.academies).not.toHaveBeenCalled(); expect(mocks.suspended).not.toHaveBeenCalled(); expect(mocks.removed).not.toHaveBeenCalled();
  });
});
