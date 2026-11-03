// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { afterEach, expect, it, vi } from "vitest";
import { PortalTransition } from "./portal-transition";

let pathname = "/onboarding";
vi.mock("@/lib/navigation", () => ({ usePathname: () => pathname }));
afterEach(cleanup);

it("wraps the children and remounts the surface only when the stage changes", () => {
  pathname = "/onboarding";
  const view = render(<PortalTransition><span>Child</span></PortalTransition>);
  const surface = view.container.querySelector("[data-portal-surface]");
  expect(surface?.textContent).toBe("Child");
  pathname = "/onboarding/student";
  view.rerender(<PortalTransition><span>Child</span></PortalTransition>);
  expect(view.container.querySelector("[data-portal-surface]")).toBe(surface);
  pathname = "/courses";
  view.rerender(<PortalTransition><span>Child</span></PortalTransition>);
  expect(view.container.querySelector("[data-portal-surface]")).not.toBe(surface);
});

it("names only the portal surface and keeps status UI outside it", () => {
  const css = readFileSync("src/components/shared/portal-transition.css", "utf8");
  const rules: { selector: string; declarations: Record<string, string> }[] = [];
  postcss.parse(css).walkRules(rule => {
    const declarations: Record<string, string> = {};
    rule.walkDecls(declaration => { declarations[declaration.prop] = declaration.value; });
    rules.push({ selector: rule.selector, declarations });
  });
  expect(rules.find(rule => rule.selector === ":active-view-transition-type(academy-join) [data-portal-surface]")?.declarations).toMatchObject({
    "view-transition-name": "academy-entry", "view-transition-class": "academy-forward",
  });
  expect(rules.filter(rule => rule.declarations["view-transition-name"] === "academy-entry").map(rule => rule.selector))
    .toEqual([":active-view-transition-type(academy-join) [data-portal-surface]"]);
  const root = readFileSync("src/routes/__root.tsx", "utf8");
  expect(root).toMatch(/<PortalTransition>.*<Outlet\s*\/>.*<\/PortalTransition>.*<Toaster\s*\/>.*<FailureStatusChip\s*\/>/s);
});
