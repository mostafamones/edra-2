import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { AcademySections } from "./section";
vi.mock("@/components/shared/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

vi.mock("./academy-filter", () => ({ AcademyFilter: () => null }));

it("keeps academy and course filters on both pagination links", () => {
  const section = AcademySections({
    title: "Assignments", section: "assignments", empty: "No assignments", academies: [],
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
