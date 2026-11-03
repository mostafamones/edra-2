// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ContentUnit } from "../types";

vi.mock("../actions", () => ({}));
vi.mock("@/modules/labels", () => ({ LabelsSubmenu: () => null }));
vi.mock("@/components/shared/link", () => ({ default: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
import { UnitActions, type UnitMenuActions } from "./menu";

const unit = { id: "unit", created_by: "author", state: "draft", version: 2, published_version: null, published_revision: 0, draft: { title: "Unit" } } as unknown as ContentUnit;
function open(manager: boolean) {
  const actions = { academyId: "academy", labelIds: {}, onApplyLabel: vi.fn(), writable: true, manager, userId: "author",
    onAction: vi.fn(), onSchedule: vi.fn(), onClone: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn(), onSheet: vi.fn() } satisfies UnitMenuActions;
  render(<TooltipProvider><UnitActions unit={unit} href="/unit" actions={actions} /></TooltipProvider>);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Unit" }), { button: 0, ctrlKey: false });
  return actions;
}
afterEach(cleanup);

it("offers managers Schedule instead of Save version, and instructors neither", async () => {
  const actions = open(true);
  expect(screen.queryByRole("menuitem", { name: "Save version" })).toBeNull();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Schedule" }));
  expect(actions.onSchedule).toHaveBeenCalledWith(unit, expect.anything());
  cleanup();
  open(false);
  await screen.findByRole("menuitem", { name: "Edit details" });
  expect(screen.queryByRole("menuitem", { name: "Schedule" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Save version" })).toBeNull();
});
