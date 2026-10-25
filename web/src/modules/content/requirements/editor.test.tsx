// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const load = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ loadRequirementOptions: load }));
import { UnitRequirements } from "./editor";
afterEach(cleanup);
it("offers a revision type without changing the choice until accepted", async () => {
  load.mockResolvedValue({ ok: true, value: { userId: "owner", types: [{ id: "regular", name: "Regular" }, { id: "revision", name: "مراجعة" }], units: [] } });
  const change = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><UnitRequirements academyId="academy" unitId="unit" userId="owner" document={{ title: "مراجعة نهائية", description: "", items: [], accessDays: 7, couponTypeId: "regular" }} onChange={change} disabled={false} /></QueryClientProvider>);
  const accept = await screen.findByRole("button", { name: "Use مراجعة" });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(accept);
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ couponTypeId: "revision" }));
});
it("lets the editor keep a revision coupon on an ordinary title", async () => {
  load.mockResolvedValue({ ok: true, value: { userId: "owner", types: [{ id: "regular", name: "Regular" }, { id: "revision", name: "Revision" }], units: [] } });
  const change = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><UnitRequirements academyId="academy" unitId="unit" userId="owner" document={{ title: "Algebra lesson", description: "", items: [], accessDays: 7, couponTypeId: "revision" }} onChange={change} disabled={false} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Keep current" }));
  expect(screen.queryByRole("button", { name: "Use Regular" })).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
it("stores the specific assessment selection in the working document", async () => {
  load.mockResolvedValue({ ok: true, value: { userId: "owner", types: [], units: [{ id: "previous", title: "Previous lesson", assessments: [{ id: "homework", kind: "assignment", title: "Homework" }] }] } });
  const change = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><UnitRequirements academyId="academy" unitId="unit" userId="owner" document={{ title: "Lesson", description: "", items: [], accessDays: 7 }} onChange={change} disabled={false} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Add prerequisite" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous lesson" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Homework" }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ prerequisites: [{ unitId: "previous", kind: "access" }, { unitId: "previous", kind: "assignment", assessmentId: "homework" }] }));
});
it("lets staff remove a requirement whose source is no longer available", async () => {
  load.mockResolvedValue({ ok: true, value: { userId: "owner", types: [], units: [] } });
  const change = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><UnitRequirements academyId="academy" unitId="unit" userId="owner" document={{ title: "Lesson", description: "", items: [], accessDays: 7, prerequisites: [{ unitId: "archived", kind: "quiz", assessmentId: "quiz" }] }} onChange={change} disabled={false} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Remove unavailable prerequisite" }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ prerequisites: [] }));
});
