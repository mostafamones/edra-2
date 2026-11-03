import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((path: string) => { throw new Error(`redirect:${path}`); }));
vi.mock("@/lib/navigation", () => ({ redirect }));

import { Route as Assignments } from "@/routes/app/$academySlug/assignments/index";
import { Route as Exams } from "@/routes/app/$academySlug/exams/index";
import { Route as Quizzes } from "@/routes/app/$academySlug/quizzes/index";

describe("legacy staff list routes", () => {
  it.each([[Assignments, "assignment"], [Quizzes, "quiz"], [Exams, "exam"]] as const)("redirects to Assessments with the type selected once the parent guard allows it (%#)", async (route, type) => {
    const loader = route.options.loader as unknown as (context: { params: { academySlug: string }; parentMatchPromise: Promise<{ loaderData: { status: string } }> }) => Promise<unknown>;
    await expect(loader({ params: { academySlug: "science" }, parentMatchPromise: Promise.resolve({ loaderData: { status: "ok" } }) })).rejects.toThrow(`redirect:/science/assessments?type=${type}`);
  });
});
