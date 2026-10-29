// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SessionRecovery } from "./session-recovery";

afterEach(cleanup);
it("offers a real sign-out/sign-in form with the current page as its return destination", () => {
  window.history.replaceState(null, "", "/academy/attendance/session?tab=units");
  render(<SessionRecovery reason="preview" />);
  expect(screen.getByText("Developer preview ended")).toBeTruthy();
  const form = screen.getByRole("button", { name: "Sign in again" }).closest("form")!;
  expect(form.method).toBe("post");
  const target = new URL(form.action);
  expect(target.pathname).toBe("/auth/signout");
  expect(target.searchParams.get("next")).toBe("/academy/attendance/session?tab=units");
});
