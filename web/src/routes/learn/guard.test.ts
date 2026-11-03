import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/navigation/components/preview", () => ({ PagePreviewView: () => null }));
vi.mock("@/modules/navigation/manifest", () => ({ findStudentItem: () => undefined }));
vi.mock("@/lib/navigation", () => ({
  notFound: () => { throw new Error("notFound"); },
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
}));

import { Route as PreviewRoute } from "./$";
import { Route as AcademySplatRoute } from "./academy/$academySlug/$";
import { Route as AssignmentsRoute } from "./academy/$academySlug/assignments/index";

type Loader = (context: { parentMatchPromise: Promise<{ status: string }>; params: { _splat: string; academySlug: string }; location: { searchStr: string } }) => Promise<unknown>;
const context = (status: string) => ({ parentMatchPromise: Promise.resolve({ status }), params: { _splat: "missing", academySlug: "school" }, location: { searchStr: "?q=1e3&q=2&academy=old&view=list" } });
const loader = (route: { options: { loader?: unknown } }) => route.options.loader as Loader;

describe("student descendant guard ordering", () => {
  for (const [name, route] of [["preview splat", PreviewRoute], ["academy splat", AcademySplatRoute], ["assignments redirect", AssignmentsRoute]] as const) {
    it(`${name} waits for a successful parent`, async () => {
      await expect(loader(route)(context("redirected"))).resolves.toBeUndefined();
      await expect(loader(route)(context("error"))).resolves.toBeUndefined();
    });
  }
  it("returns not found for an unknown preview after the guard succeeds", async () => {
    await expect(loader(PreviewRoute)(context("success"))).rejects.toThrow("notFound");
    await expect(loader(AcademySplatRoute)(context("success"))).rejects.toThrow("notFound");
  });
  it("redirects after the guard succeeds, dropping repeated values and replacing academy", async () => {
    await expect(loader(AssignmentsRoute)(context("success"))).rejects.toThrow("redirect:/assignments?academy=school&view=list");
  });
});
