// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SuspensionRequest, SuspensionTarget } from "../use-suspension";
import { SuspensionDialog } from "./suspension-dialog";

const target = (recordId: string, suspended: boolean, revision: number, archived = false): SuspensionTarget => ({ recordId, suspended, revision, archived });

function show(request: SuspensionRequest) {
  const onConfirm = vi.fn();
  render(<SuspensionDialog request={request} onClose={vi.fn()} onConfirm={onConfirm} />);
  return onConfirm;
}
const confirm = () => screen.getByRole("button", { name: /^(Suspend|Restore)$/ }) as HTMLButtonElement;

describe("suspension confirmation", () => {
  afterEach(cleanup);

  it("opens ready and hands over the reason without any count", () => {
    const onConfirm = show({ suspend: true, targets: [target("r1", false, 0), target("r2", true, 3)] });
    expect(screen.getByRole("heading", { name: "Suspend online access for 2 students?" })).toBeTruthy();
    expect(screen.queryByText(/will change/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Unpaid" } });
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ suspend: true }), "Unpaid");
  });

  it("says when archival suspension remains after restoring", () => {
    show({ suspend: false, targets: [target("r1", true, 1, true)], name: "Amal" });
    expect(screen.getByRole("heading", { name: "Restore online access for Amal?" })).toBeTruthy();
    expect(screen.getByText("1 archived: online access stays suspended until restored")).toBeTruthy();
  });

  it("reopens after a failure with the reason and the error", () => {
    show({ suspend: true, targets: [target("r1", false, 2)], name: "Amal", reason: "Unpaid", error: "Changed since review." });
    expect((screen.getByLabelText("Reason (optional)") as HTMLTextAreaElement).value).toBe("Unpaid");
    expect(screen.getByRole("alert").textContent).toBe("Changed since review.");
    expect(confirm().disabled).toBe(false);
  });

  it("blocks confirmation when records are gone", () => {
    show({ suspend: true, targets: [target("r1", false, 0)], missing: 1 });
    expect(screen.getByText("1 student no longer exist. Close and reselect.")).toBeTruthy();
    expect(confirm().disabled).toBe(true);
  });
});
