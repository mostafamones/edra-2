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
    for (const name of ["Change group", "Archive", "Restore", "Suspend online access", "Restore online access"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("keeps the managers' actions, offering what the selection allows", () => {
    render(<BulkBar selected={2} labels={<button>Labels</button>} onClear={vi.fn()}
      manager={{ archivable: 2, restorable: 0, onArchive: vi.fn(), onRestore: vi.fn(), onChangeGroup: vi.fn(), suspendable: 2, unsuspendable: 0, onSuspension: vi.fn() }} />);
    for (const name of ["Labels", "Change group", "Archive", "Suspend online access"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore online access" })).toBeNull();
  });

  it("offers both online-access actions for a mixed selection", () => {
    const onSuspension = vi.fn();
    render(<BulkBar selected={3} labels={<button>Labels</button>} onClear={vi.fn()}
      manager={{ archivable: 3, restorable: 0, onArchive: vi.fn(), onRestore: vi.fn(), onChangeGroup: vi.fn(), suspendable: 2, unsuspendable: 1, onSuspension }} />);
    screen.getByRole("button", { name: "Restore online access" }).click();
    screen.getByRole("button", { name: "Suspend online access" }).click();
    expect(onSuspension.mock.calls).toEqual([[false], [true]]);
  });
});
