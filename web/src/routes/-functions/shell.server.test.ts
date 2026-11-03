import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ host: "learn.lvh.me:3000", claims: true, amr: [{ method: "password" }] as unknown, academies: [] as { slug: string }[], remembered: undefined as string | undefined, staff: false, profile: { level_id: "level", parent_phone_verified_at: "yes", parent_phone: "123" }, invite: null as string | null, studentAcademies: [] as unknown[], join: { kind: "none" }, entry: null as { kind: string, token: string } | null, preview: { kind: "unauthenticated" }, form: vi.fn(), previewFn: vi.fn() }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/server/request", () => ({ headers: async () => new Headers({ host: mocks.host }), cookies: async () => ({ get: () => mocks.remembered ? { value: mocks.remembered } : undefined }) }));
vi.mock("@/lib/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: mocks.claims ? { sub: "user", amr: mocks.amr } : null } }) } }) }));
vi.mock("@/modules/academies/server", () => ({ listStaffAcademies: async () => mocks.academies }));
vi.mock("@/modules/staff/server", () => ({ isStaffAccount: async () => mocks.staff, getStaffJoinState: async () => ({ kind: "none" }) }));
vi.mock("@/modules/students/server", () => ({ getStudentProfile: async () => ({ data: mocks.profile, error: null }), listMyStudentAcademies: async () => mocks.studentAcademies, pendingStudentInviteToken: async () => mocks.invite, getStudentJoinState: async () => mocks.join, pendingStudentEntry: async () => mocks.entry, previewStudentBookingEntry: mocks.previewFn, getStudentBookingForm: mocks.form }));
import { account, academyCreate, booking, instructorJoin, onboarding, signedIn, student, studentJoin } from "./shell.server";
import { staffAcademyHref, staffEntryHref, studentBookingHref, studentHref } from "@/lib/routing";

beforeEach(() => { mocks.host = "learn.lvh.me:3000"; mocks.claims = true; mocks.amr = [{ method: "password" }]; mocks.academies = []; mocks.remembered = undefined; mocks.staff = false; mocks.invite = null; mocks.studentAcademies = []; mocks.join = { kind: "none" }; mocks.entry = null; mocks.previewFn.mockReset(); mocks.form.mockReset(); });
describe("shell guards", () => {
  it.each(["otp", "recovery", "magiclink", undefined])("rejects %s sessions at the server-function boundary", async method => {
    mocks.amr = method ? [{ method }] : undefined;
    expect(await signedIn()).toBe(false);
  });
  it.each(["otp", "recovery", "magiclink", undefined].flatMap(method => ([
    [account, "/account"], [onboarding, "/onboarding"],
    [student, "/onboarding/student"], [studentJoin, "/onboarding/student/join"],
    [instructorJoin, "/onboarding/instructor/join"], [academyCreate, "/onboarding/academy/create"],
  ] as const).map(([load, path]) => ({ method, load, path }))))("rejects $method authority for $path without the page gateway", async ({ method, load, path }) => {
    mocks.amr = method ? [{ method }] : undefined;
    await expect(load()).rejects.toThrow(`redirect:/auth/login?next=${path}`);
  });
  it("accepts an ordinary session for onboarding", async () => {
    expect(await signedIn()).toBe(true);
    await expect(onboarding()).resolves.toBeUndefined();
    await expect(academyCreate()).resolves.toBe("user");
  });
  it("redirects booking to the student host before reading entry", async () => { mocks.host = "lvh.me:3000"; await expect(booking("token")).rejects.toThrow(`redirect:${studentBookingHref("token")}`); expect(mocks.previewFn).not.toHaveBeenCalled(); });
  it.each(["connected", "existing", "enroll", "staff_help", "level_unavailable", "closed", "changed"])("redirects booking state %s to onboarding", async kind => { mocks.previewFn.mockResolvedValue({ kind }); await expect(booking("token")).rejects.toThrow(`redirect:${studentBookingHref("token", "/join")}`); expect(mocks.form).not.toHaveBeenCalled(); });
  it("redirects account to login or the remembered workspace", async () => { mocks.claims = false; await expect(account()).rejects.toThrow("redirect:/auth/login?next=/account"); mocks.claims = true; mocks.academies = [{ slug: "first" }, { slug: "second" }]; mocks.remembered = "second"; await expect(account()).rejects.toThrow(`redirect:${staffAcademyHref("second", "/manage/account")}`); });
  it("keeps student onboarding redirect priority", async () => { mocks.staff = true; await expect(student()).rejects.toThrow(`redirect:${staffEntryHref()}`); mocks.staff = false; mocks.invite = "token"; mocks.studentAcademies = [{}]; await expect(student()).rejects.toThrow("redirect:/onboarding/student/join"); });
  it("keeps student join redirects", async () => { mocks.join = { kind: "setup_required" }; await expect(studentJoin()).rejects.toThrow("redirect:/onboarding/student"); mocks.join = { kind: "none" }; await expect(studentJoin()).rejects.toThrow(`redirect:${studentHref()}`); mocks.join = { kind: "form" }; mocks.entry = { kind: "booking", token: "token" }; await expect(studentJoin()).rejects.toThrow(`redirect:${studentBookingHref("token")}`); });
});
