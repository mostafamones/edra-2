// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PrerequisitePicker } from "./picker";
const units = [{ id: "foundation", title: "Fundamentals", assessments: [{ id: "quiz", kind: "quiz" as const, title: "Loops quiz" }, { id: "homework", kind: "assignment" as const, title: "Variables homework" }] }, { id: "other", title: "Another unit", assessments: null }];
afterEach(cleanup);
it("shows only chosen units on the page and searches collapsed units in the picker", () => {
  const change = vi.fn();
  render(<PrerequisitePicker units={units} selected={[]} onChange={change} disabled={false} />);
  expect(screen.queryByText("Fundamentals")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add prerequisite" }));
  expect(screen.queryByRole("checkbox", { name: "Loops quiz" })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Loops" } });
  expect(screen.queryByRole("button", { name: "Another unit" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Variables homework" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Loops quiz" }));
  expect(change).toHaveBeenCalledWith([{ unitId: "foundation", kind: "access" }, { unitId: "foundation", kind: "quiz", assessmentId: "quiz" }]);
});
it("allows a unit-only prerequisite even when it has no assessments", () => {
  const change = vi.fn();
  render(<PrerequisitePicker units={units} selected={[]} onChange={change} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Add prerequisite" }));
  fireEvent.click(screen.getByRole("button", { name: "Another unit" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Previously unlocked" }));
  expect(change).toHaveBeenCalledWith([{ unitId: "other", kind: "access" }]);
});
it("removes a whole prerequisite without displaying the rest of the catalog", () => {
  const change = vi.fn();
  render(<PrerequisitePicker units={units} selected={[{ unitId: "foundation", kind: "access" }, { unitId: "foundation", kind: "quiz", assessmentId: "quiz" }]} onChange={change} disabled={false} />);
  expect(screen.queryByText("Another unit")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove Fundamentals" }));
  expect(change).toHaveBeenCalledWith([]);
});
