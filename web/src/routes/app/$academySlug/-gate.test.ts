import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/modules/navigation/components/staff-preview", () => ({ StaffPreview: () => null }));
vi.mock("@/modules/navigation/manifest", () => ({ findStaffItem: () => undefined }));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/modules/question-bank/page", () => ({ QuestionBankPage: () => null }));

import { Route as Assignment } from "./assignments/index";
import { Route as Attendance } from "./attendance/$id/attendance/index";
import { Route as CatchAll } from "./$";
import { Route as QuestionBank } from "./question-bank/index";

type StaffResult = { status: string; academy?: { id: string; role: string } };
type Context = { params: { academySlug: string; id: string; _splat: string }; parentMatchPromise: Promise<{ loaderData?: StaffResult }> };
const context = (loaderData?: StaffResult, splat = "missing"): Context => ({
  params: { academySlug: "science", id: "a/b%", _splat: splat }, parentMatchPromise: Promise.resolve({ loaderData }),
});
const loader = (route: typeof Assignment | typeof Attendance | typeof CatchAll | typeof QuestionBank) => route.options.loader as unknown as (context: Context) => Promise<unknown>;

describe("staff child loader guard", () => {
  it.each([Assignment, CatchAll])("does nothing for suspended and redirected or not-found parents", async (route) => {
    await expect(loader(route)(context({ status: "suspended" }))).resolves.toBeUndefined();
    await expect(loader(route)(context())).resolves.toBeUndefined();
  });
  it("redirects the assignment list after an ok parent", async () => {
    await expect(loader(Assignment)(context({ status: "ok" }))).rejects.toThrow("redirect:/science/assessments?type=assignment");
  });
  it("returns not found or redirects the catch-all after an ok parent", async () => {
    await expect(loader(CatchAll)(context({ status: "ok" }))).rejects.toThrow("notFound");
    await expect(loader(CatchAll)(context({ status: "ok" }, "sessions/abc"))).rejects.toThrow("redirect:/science/attendance/abc");
  });
  it("encodes a decoded attendance identifier after an ok parent", async () => {
    await expect(loader(Attendance)(context({ status: "ok" }))).rejects.toThrow("redirect:/science/attendance/a%2Fb%25");
  });
  it("opens the question bank only for managers of the academy resolved by the parent", async () => {
    const scoped = (id: string, role: string) => context({ status: "ok", academy: { id, role } });
    for (const role of ["owner", "head_admin", "admin"]) {
      await expect(loader(QuestionBank)(scoped("academy-a", role))).resolves.toBe("academy-a");
    }
    await expect(loader(QuestionBank)(scoped("academy-b", "instructor"))).rejects.toThrow("notFound");
    await expect(loader(QuestionBank)(context({ status: "suspended" }))).resolves.toBeNull();
    await expect(loader(QuestionBank)(context())).resolves.toBeNull();
  });
});
