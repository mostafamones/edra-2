// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccessDuration } from "./duration";
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function Editor() { const [days, setDays] = useState(7); return <><AccessDuration value={days} onChange={setDays} disabled={false} /><output aria-label="Saved days">{days}</output></>; }
it("offers presets and a custom day count with steppers that stays custom on a preset value", async () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("combobox", { name: "Duration" }));
  fireEvent.click(await screen.findByRole("option", { name: "30 days" }));
  expect(screen.getByLabelText("Saved days").textContent).toBe("30");
  expect(screen.queryByLabelText("Days")).toBeNull();
  fireEvent.click(screen.getByRole("combobox", { name: "Duration" }));
  fireEvent.click(await screen.findByRole("option", { name: "Custom" }));
  fireEvent.change(screen.getByLabelText("Days"), { target: { value: "15" } });
  fireEvent.click(screen.getByRole("button", { name: "Fewer days" }));
  expect(screen.getByLabelText("Saved days").textContent).toBe("14");
  fireEvent.click(screen.getByRole("button", { name: "More days" }));
  expect(screen.getByLabelText("Saved days").textContent).toBe("15");
  expect(screen.getByLabelText("Days")).toBeTruthy();
});
