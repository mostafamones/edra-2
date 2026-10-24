// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const load = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ loadRequirementOptions: load }));
import { UnitRequirements } from "./editor";
afterEach(cleanup);
it("stores the specific assessment selection in the working document", async () => {
  load.mockResolvedValue({ ok: true, value: { userId: "owner", types: [], units: [{ id: "previous", title: "Previous lesson", assessments: [{ id: "homework", kind: "assignment", title: "Homework" }] }] } });
  const change = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><UnitRequirements academyId="academy" unitId="unit" userId="owner" document={{ title: "Lesson", description: "", items: [], accessDays: 7 }} onChange={change} disabled={false} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Homework" }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ prerequisites: [{ unitId: "previous", kind: "assignment", assessmentId: "homework" }] }));
});
