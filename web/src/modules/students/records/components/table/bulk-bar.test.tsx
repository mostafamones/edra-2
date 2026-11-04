// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkBar } from "./bulk-bar";

describe("student bulk bar", () => {
  afterEach(cleanup);

  it("gives Instructors the Labels action and no administrative actions", () => {
    render(<BulkBar selected={2} labels={<button>Labels</button>} onClear={vi.fn()} />);
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Labels" })).toBeTruthy();
    for (const name of ["Change group", "Archive", "Restore", "Suspend"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("keeps the managers' actions, offering what the selection allows", () => {
    render(<BulkBar selected={2} labels={<button>Labels</button>} onClear={vi.fn()}
      manager={{ archivable: 2, restorable: 0, onArchive: vi.fn(), onRestore: vi.fn(), onChangeGroup: vi.fn(), suspendable: 2, unsuspendable: 0, onSuspension: vi.fn() }} />);
    for (const name of ["Labels", "Change group", "Archive", "Suspend"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("hides Change group when no single group can take the selection", () => {
    render(<BulkBar selected={2} labels={<button>Labels</button>} onClear={vi.fn()}
      manager={{ archivable: 2, restorable: 0, onArchive: vi.fn(), onRestore: vi.fn(), suspendable: 2, unsuspendable: 0, onSuspension: vi.fn() }} />);
    expect(screen.queryByRole("button", { name: "Change group" })).toBeNull();
  });

  it("offers Restore only when every selected student is suspended, and neither for a mixed selection", () => {
    const onSuspension = vi.fn();
    const manager = { archivable: 3, restorable: 0, onArchive: vi.fn(), onRestore: vi.fn(), onChangeGroup: vi.fn(), onSuspension };
    const { rerender } = render(<BulkBar selected={3} labels={<button>Labels</button>} onClear={vi.fn()} manager={{ ...manager, suspendable: 2, unsuspendable: 1 }} />);
    for (const name of ["Suspend", "Restore"]) expect(screen.queryByRole("button", { name })).toBeNull();
    rerender(<BulkBar selected={3} labels={<button>Labels</button>} onClear={vi.fn()} manager={{ ...manager, suspendable: 0, unsuspendable: 3 }} />);
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull();
    screen.getByRole("button", { name: "Restore" }).click();
    expect(onSuspension).toHaveBeenCalledWith(false);
  });
});
