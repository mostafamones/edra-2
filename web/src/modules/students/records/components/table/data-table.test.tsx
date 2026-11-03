// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { StudentRecordRow } from "../../types";
import { buildColumns } from "./columns";
import { StudentsDataTable } from "./data-table";

const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation", () => ({ useRouter: () => ({ push }) }));

const row = (change: Partial<StudentRecordRow> = {}): StudentRecordRow => ({
  id: "r1", academyStudentProfileId: "p1", fullName: "Amal", studentPhone: "+201012345678", parentPhone: "+201112223333",
  levelId: "preparatory-3", levelName: "Third Preparatory", trackId: null, trackName: null, primaryGroupId: null, groupName: null,
  participationType: "in_person", archivedAt: null, createdAt: "2030-09-01T00:00:00Z", updatedAt: "2030-09-01T00:00:00Z", version: 1,
  onlineAccount: "not_connected", accountName: null, labelIds: [], ...change,
});

const actions = { academyId: "a1", canManage: true, onApplyLabel: vi.fn(), onOpen: vi.fn(), onArchive: vi.fn() };
const rowHref = (record: StudentRecordRow) => `/app/students/${record.id}`;

function Harness({ record }: { record: StudentRecordRow }) {
  const columns = buildColumns({
    ...actions, canSelect: true, catalog: [{ id: "l1", name: "Scholarship", color: "blue" }, { id: "l2", name: "Other", color: "red" }], catalogFailed: false,
    isSelected: () => false, pageSelection: false, onToggleRow: vi.fn(), onTogglePage: vi.fn(), codes: {},
  });
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: [record], columns, getCoreRowModel: getCoreRowModel(), getRowId: (item) => item.id });
  return (
    <TooltipProvider>
      <StudentsDataTable table={table} sorts={[]} onSortsChange={vi.fn()} loading={false} fetching={false} skeletonRows={1} empty={null}
        isSelected={() => false} rowActions={actions} rowHref={rowHref} />
    </TooltipProvider>
  );
}

const bodyRow = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("student table rows", () => {
  beforeAll(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
  afterEach(() => { cleanup(); push.mockClear(); });

  it("opens the student from anywhere on the row, and the name is not a link", () => {
    render(<Harness record={row()} />);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByText("Third Preparatory"));
    expect(push).toHaveBeenCalledWith("/app/students/r1");
    push.mockClear();
    fireEvent.click(screen.getByText("Amal"));
    expect(push).toHaveBeenCalledWith("/app/students/r1");
  });

  it("opens with Enter on the focused row only", () => {
    render(<Harness record={row()} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Amal" }), { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(bodyRow("Amal"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/app/students/r1");
  });

  it("doesn't open from the selection and actions controls or their cells", () => {
    render(<Harness record={row()} />);
    const checkbox = screen.getByRole("checkbox", { name: "Select Amal" });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox.closest("td") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Amal" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a differing account name first and swaps to the record name on click without opening the student", () => {
    render(<Harness record={row({ accountName: "Amal Hassan" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Amal Hassan" }));
    expect(screen.getByRole("button", { name: "Amal" }).getAttribute("aria-pressed")).toBe("false");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows labels in the name cell, with no Labels column", () => {
    render(<Harness record={row({ labelIds: ["l1"] })} />);
    expect(within(screen.getByText("Amal").closest("td") as HTMLElement).getAllByText("Scholarship").length).toBeGreaterThan(0);
    expect(screen.queryByText("Other")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /labels/i })).toBeNull();
  });
});
