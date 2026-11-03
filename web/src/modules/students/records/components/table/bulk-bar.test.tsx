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
    for (const name of ["Change group", "Archive", "Restore"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("keeps the managers' actions, offering what the selection allows", () => {
    render(<BulkBar selected={2} labels={<button>Labels</button>} onClear={vi.fn()}
      manager={{ archivable: 2, restorable: 0, onArchive: vi.fn(), onRestore: vi.fn(), onChangeGroup: vi.fn() }} />);
    for (const name of ["Labels", "Change group", "Archive"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});
