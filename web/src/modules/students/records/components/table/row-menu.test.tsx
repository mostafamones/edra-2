// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { StudentRecordRow } from "../../types";
import { StudentRowActions, StudentRowMenu, type RowActions } from "./row-menu";

const record = (archivedAt: string | null = null, manuallySuspended = false): StudentRecordRow => ({
  id: "r1", academyStudentProfileId: "p1", fullName: "Amal", studentPhone: "+201012345678", parentPhone: "+201112223333",
  levelId: "preparatory-3", levelName: "Third Preparatory", trackId: null, trackName: null, primaryGroupId: null, groupName: null,
  participationType: "in_person", archivedAt, createdAt: "2030-09-01T00:00:00Z", updatedAt: "2030-09-01T00:00:00Z", version: 1,
  onlineAccount: "not_connected", manuallySuspended, suspensionRevision: 0, accountName: null, labelIds: [],
});

const actions = (change: Partial<RowActions> = {}): RowActions => ({
  academyId: "a1", canManage: true, onApplyLabel: vi.fn(), onOpen: vi.fn(), onArchive: vi.fn(), onSuspension: vi.fn(), onCode: vi.fn(), ...change,
});

function show(row: StudentRecordRow, rowActions: RowActions, selected = false) {
  render(
    <TooltipProvider>
      <table><tbody>
        <StudentRowMenu row={row} actions={rowActions}>
          <tr data-testid="row" data-state={selected ? "selected" : undefined}><td><StudentRowActions row={row} actions={rowActions} /></td></tr>
        </StudentRowMenu>
      </tbody></table>
    </TooltipProvider>,
  );
}

const items = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);

describe("student row menus", () => {
  afterEach(cleanup);

  it("offer the same actions on right-click and from the Actions button", async () => {
    show(record(), actions());
    fireEvent.contextMenu(screen.getByTestId("row"));
    const context = items(await screen.findByRole("menu"));
    expect(context).toEqual(["Edit", "Student code", "Labels", "Suspend online access", "Archive"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Amal" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    expect(items(await screen.findByRole("menu"))).toEqual(context);
  });

  it("right-click runs the row's action", async () => {
    const onArchive = vi.fn();
    const row = record();
    show(row, actions({ onArchive }));
    fireEvent.contextMenu(screen.getByTestId("row"));
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledWith(row, true);
  });

  it("offer View, Labels and Restore on an archived record, and nothing managerial to other staff", async () => {
    show(record("2030-10-01T00:00:00Z"), actions());
    fireEvent.contextMenu(screen.getByTestId("row"));
    expect(items(await screen.findByRole("menu"))).toEqual(["View", "Labels", "Suspend online access", "Restore"]);
    cleanup();
    show(record(), actions({ canManage: false, onCode: undefined }));
    fireEvent.contextMenu(screen.getByTestId("row"));
    expect(items(await screen.findByRole("menu"))).toEqual(["Edit", "Labels"]);
  });

  it("offers restoring manual suspension from both menus, including unconnected and archived records", async () => {
    const onSuspension = vi.fn();
    const row = record("2030-10-01T00:00:00Z", true);
    show(row, actions({ onSuspension }));
    fireEvent.contextMenu(screen.getByTestId("row"));
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Restore online access" }));
    expect(onSuspension).toHaveBeenCalledWith(row, false);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Amal" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Restore online access" }));
    expect(onSuspension).toHaveBeenCalledTimes(2);
  });

  it("gives Instructors no suspension action", async () => {
    show(record(null, true), actions({ canManage: false, onCode: undefined }));
    fireEvent.contextMenu(screen.getByTestId("row"));
    expect(items(await screen.findByRole("menu"))).toEqual(["Edit", "Labels"]);
  });

  it("keeps the row's selected state and makes it reachable by keyboard", () => {
    show(record(), actions(), true);
    const row = screen.getByTestId("row");
    expect(row.getAttribute("data-state")).toBe("selected");
    expect(row.getAttribute("tabindex")).toBe("0");
  });
});
