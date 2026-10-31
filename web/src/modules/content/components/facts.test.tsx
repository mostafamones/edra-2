// @vitest-environment jsdom
import { Add01Icon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UnitFacts } from "./facts";

afterEach(cleanup);
const facts = [
  { key: "videos", icon: Add01Icon, label: "Videos", rows: [{ title: "Intro" }] },
  { key: "assignments", icon: Add01Icon, label: "Assignments", rows: [{ title: "Homework", answered: false }, { title: "Project", answered: true }] },
];
const press = (name: RegExp) => { const button = screen.getByRole("button", { name }); fireEvent.pointerDown(button); fireEvent.click(button); };

it("switches content in one open popover, sliding from the clicked side", async () => {
  render(<TooltipProvider><UnitFacts facts={facts} /></TooltipProvider>);
  press(/Videos/);
  const popover = await screen.findByRole("dialog", { name: "Videos" });
  expect(screen.getByText("Intro").closest(".slide-in-from-right-6, .slide-in-from-left-6")).toBeNull();

  await new Promise(resolve => setTimeout(resolve)); // Radix attaches its outside-press listener on the next tick.
  press(/Assignments/);
  expect(screen.getByRole("dialog", { name: "Assignments" })).toBe(popover);
  expect(screen.getByText("Unanswered").className).toContain("text-destructive");
  expect(screen.getByText("Answered").className).not.toContain("text-destructive");
  expect(screen.getByText("Homework").closest(".slide-in-from-right-6")).not.toBeNull();

  press(/Videos/);
  expect(screen.getByRole("dialog", { name: "Videos" })).toBe(popover);
  expect(screen.getByText("Intro").closest(".slide-in-from-left-6")).not.toBeNull();

  press(/Videos/);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("closes on a press outside the card's counts", async () => {
  render(<TooltipProvider><UnitFacts facts={facts} /><button>Elsewhere</button></TooltipProvider>);
  press(/Videos/);
  await screen.findByRole("dialog", { name: "Videos" });
  await new Promise(resolve => setTimeout(resolve));
  press(/Elsewhere/); // This Radix dismisses on the click that follows the press.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
