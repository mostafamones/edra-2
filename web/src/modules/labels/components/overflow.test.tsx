// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Label } from "../types";
import { LabelOverflow } from "./overflow";

const labels = ["One", "Two", "Three"].map((name) => ({ id: name, name, color: "blue" })) as Label[];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(needed: number, available: number) {
  let notify = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { notify = callback; } observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => needed);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => available);
  render(<TooltipProvider><LabelOverflow labels={labels} /></TooltipProvider>);
  act(() => notify());
}

it("shows every badge while they fit", () => {
  setup(100, 100);
  expect(within(screen.getByRole("list", { name: "Labels" })).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.queryByText("+2")).toBeNull();
});

it("keeps the first badge and collapses the rest into +N with their badges in a tooltip", async () => {
  setup(101, 100);
  const more = screen.getByText("+2").parentElement!;
  expect(more.textContent).toBe("+2Two, Three");
  fireEvent.focus(more);
  const tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText("Two")).toBeTruthy();
  expect(within(tooltip).getByText("Three")).toBeTruthy();
});

it("measures labels that arrive after the first render", () => {
  let notify = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { notify = callback; } observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => 101);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => 100);
  const { rerender } = render(<TooltipProvider><LabelOverflow labels={[]} /></TooltipProvider>);
  rerender(<TooltipProvider><LabelOverflow labels={labels} /></TooltipProvider>);
  act(() => notify());
  expect(screen.getByText("+2")).toBeTruthy();
});
