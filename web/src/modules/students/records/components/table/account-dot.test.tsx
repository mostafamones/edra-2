// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AccountDot } from "./account-dot";

describe("account dot", () => {
  afterEach(cleanup);

  it("keeps the link semantics and marks unconnected manual suspension without a link dot", () => {
    const { container, rerender } = render(<AccountDot state="not_connected" />);
    expect(container.innerHTML).toBe("");
    rerender(<AccountDot state="not_connected" manuallySuspended />);
    expect(screen.getByRole("img", { name: "Suspended online access" })).toBeTruthy();
    rerender(<AccountDot state="connected" />);
    expect(screen.getByRole("img", { name: "Active online access" })).toBeTruthy();
    rerender(<AccountDot state="suspended" />);
    expect(screen.getByRole("img", { name: "Suspended online access" })).toBeTruthy();
  });
});
