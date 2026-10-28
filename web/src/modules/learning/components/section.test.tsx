import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AcademySections } from "./section";

vi.mock("@/modules/students/server", () => ({ listMyStudentAcademies: async () => [] }));
vi.mock("./academy-filter", () => ({ AcademyFilter: () => null }));

it("keeps academy and course filters on both pagination links", async () => {
  const section = await AcademySections({
    title: "Assignments", section: "assignments", empty: "No assignments",
    scope: { slug: "academy-one", page: 2 }, query: { unit: "course-one" },
    groups: [{ academy: { id: "one", slug: "academy-one", name: "Academy One" }, items: [], hasMore: true }],
    children: () => null,
  });
  const html = renderToStaticMarkup(section);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
    Object.fromEntries(new URL(match[1].replaceAll("&amp;", "&"), "https://learn.example").searchParams));
  expect(links).toEqual([
    { unit: "course-one", academy: "academy-one" },
    { unit: "course-one", academy: "academy-one", page: "3" },
  ]);
});
