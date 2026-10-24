// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccessDuration } from "./duration";
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function Editor() { const [days, setDays] = useState(7); return <><AccessDuration value={days} onChange={setDays} disabled={false} /><output aria-label="Saved days">{days}</output></>; }
it("offers presets and retains custom mode while editing a number equal to a preset", async () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("combobox", { name: "Access duration" }));
  fireEvent.click(await screen.findByRole("option", { name: "30 days" }));
  expect(screen.getByLabelText("Saved days").textContent).toBe("30");
  expect(screen.queryByLabelText("Access duration (days)")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "Access duration" }));
  fireEvent.click(await screen.findByRole("option", { name: "Custom" }));
  fireEvent.change(screen.getByLabelText("Access duration (days)"), { target: { value: "14" } });
  expect(screen.getByLabelText("Saved days").textContent).toBe("14");
  expect(screen.getByLabelText("Access duration (days)")).toBeTruthy();
});
