// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Label } from "../types";
import { LabelSquares } from "./squares";

const labels = ["One", "Two", "Three"].map((name) => ({ id: name, name, color: "blue" })) as Label[];

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(needed: number, available: number) {
  let notify = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { notify = callback; } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => needed);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => available);
  render(<LabelSquares labels={labels} />);
  act(() => notify());
}

const visibleList = () => screen.getByRole("list", { name: "Labels" });

it("keeps whole badges while they fit", () => {
  setup(100, 100);
  expect(visibleList().querySelectorAll("[tabindex]")).toHaveLength(0);
});

it("keeps the first whole and overlaps later squares, leaving the first square clear of it", () => {
  setup(101, 100);
  const squares = visibleList().querySelectorAll("[tabindex]");
  expect(visibleList().children).toHaveLength(3);
  expect(squares).toHaveLength(2);
  expect(squares[0].className).not.toContain("-ml-");
  expect(squares[1].className).toContain("-ml-");
  expect(squares[1].textContent).toBe("Three");
});

it("swaps after 400ms over another square and holds through a row shift until the pointer really moves", () => {
  setup(101, 100);
  vi.useFakeTimers();
  const [two, three] = visibleList().querySelectorAll("[tabindex]");
  const expanded = (square: Element) => square.querySelector("[data-slot=badge]")?.className.includes("max-w-40");
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  fireEvent.mouseEnter(two, { clientX: 0, clientY: 0 });
  wait(399);
  expect(expanded(two)).toBe(false);
  wait(1);
  expect(expanded(two)).toBe(true);

  fireEvent.mouseMove(three, { clientX: 20, clientY: 0 });
  wait(399);
  expect(expanded(two)).toBe(true);
  expect(expanded(three)).toBe(false);
  wait(1);
  expect(expanded(two)).toBe(false);
  expect(expanded(three)).toBe(true);

  // The row shifted: the still pointer, or one barely moved, is now over another square.
  fireEvent.mouseMove(two, { clientX: 20, clientY: 0 });
  fireEvent.mouseMove(two, { clientX: 30, clientY: 0 });
  wait(400);
  expect(expanded(three)).toBe(true);

  fireEvent.mouseMove(two, { clientX: 40, clientY: 0 });
  wait(400);
  expect(expanded(two)).toBe(true);

  fireEvent.mouseMove(document.body, { clientX: 200, clientY: 0 });
  wait(400);
  expect(expanded(two)).toBe(false);
});

it("swaps within the small-move distance when the pointer reaches a square it didn't land on", () => {
  setup(101, 100);
  vi.useFakeTimers();
  const [two, three] = visibleList().querySelectorAll("[tabindex]");
  const expanded = (square: Element) => square.querySelector("[data-slot=badge]")?.className.includes("max-w-40");
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  fireEvent.mouseEnter(two, { clientX: 0, clientY: 0 });
  wait(400);
  fireEvent.mouseMove(two, { clientX: 0, clientY: 0 });
  fireEvent.mouseMove(three, { clientX: 5, clientY: 0 });
  wait(400);
  expect(expanded(three)).toBe(true);
});
