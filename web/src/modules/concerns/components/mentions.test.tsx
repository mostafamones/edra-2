// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConcernMentions } from "./mentions";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("selects a mention by pointer and keyboard", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const onSelect = vi.fn();
  render(<ConcernMentions participants={[{ userId: "a", name: "Mona" }, { userId: "b", name: "Omar" }]} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Mention participant" }));
  fireEvent.click(await screen.findByRole("option", { name: "Omar" }));
  expect(onSelect).toHaveBeenCalledWith({ userId: "b", name: "Omar" });
  fireEvent.click(screen.getByRole("button", { name: "Mention participant" }));
  const input = await screen.findByRole("combobox", { name: "Find participant" });
  fireEvent.change(input, { target: { value: "Mona" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSelect).toHaveBeenLastCalledWith({ userId: "a", name: "Mona" });
});
