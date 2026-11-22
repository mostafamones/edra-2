// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, expect, it } from "vitest";
import { LeaveGuard } from "./leave-guard";

afterEach(cleanup);

function setup(when: boolean) {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/", component: () => <><p>Import page</p><LeaveGuard when={when} /></> }),
    createRoute({ getParentRoute: () => root, path: "/library", component: () => <p>Library page</p> }),
  ]);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
  render(<RouterProvider router={router} />);
  return router;
}

it("asks before leaving unsaved review work and keeps the review on cancel", async () => {
  const router = setup(true);
  await screen.findByText("Import page");
  act(() => router.history.push("/library"));
  expect(await screen.findByRole("alertdialog", { name: "Leave this import?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep reviewing" }));
  expect(screen.getByText("Import page")).toBeTruthy();
  act(() => router.history.push("/library"));
  fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
  expect(await screen.findByText("Library page")).toBeTruthy();
});

it("leaves without asking when nothing is unsaved", async () => {
  const router = setup(false);
  await screen.findByText("Import page");
  act(() => router.history.push("/library"));
  expect(await screen.findByText("Library page")).toBeTruthy();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
