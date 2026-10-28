// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ViewSettings } from "./view-settings";
import type { UnitStatus } from "../started";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(cleanup);

it("isolates a status on double click and restores the prior selection on one click", () => {
  function Example() {
    const [statuses, setStatuses] = useState<UnitStatus[]>(["active", "expired"]);
    return <ViewSettings statuses={statuses} group="none" onStatusesChange={setStatuses} onLayoutChange={() => {}} onAcademyChange={() => {}} onGroupChange={() => {}} />;
  }
  render(<Example />);
  const completed = screen.getByRole("button", { name: "completed" });
  fireEvent.click(completed, { detail: 1 });
  fireEvent.click(completed, { detail: 2 });
  fireEvent.doubleClick(completed);
  expect(completed.getAttribute("aria-pressed")).toBe("true");
  expect(completed.className).toContain("bg-primary/10");
  expect(screen.getByRole("button", { name: "active" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(completed, { detail: 1 });
  expect(completed.className).not.toContain("bg-primary/10");
  expect(completed.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("button", { name: "active" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "expired" }).getAttribute("aria-pressed")).toBe("true");
});
