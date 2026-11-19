// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MathText } from "./math-text";

afterEach(cleanup);

it("renders accessible math among Arabic prose while isolating equation direction", () => {
  const { container, rerender } = render(<MathText value={String.raw`احسب \(\frac{\text{س}}{٢} + \sqrt{٩}\)`} />);
  expect(container.querySelector("mfrac")).not.toBeNull();
  expect(container.querySelector("msqrt")).not.toBeNull();
  expect(container.querySelector("bdi")?.dir).toBe("ltr");
  expect(container.textContent).toContain("احسب");
  expect(container.querySelector("annotation")?.textContent).toContain("\\frac");
  rerender(<MathText value={String.raw`\(x^{٢}\)`} />);
  expect(container.querySelector("mfrac")).toBeNull();
  expect(container.querySelector("msup")).not.toBeNull();
});

it("keeps invalid source editable and renders hostile ordinary text as text", () => {
  const bad = String.raw`\(\invalidCommand{a}\)`;
  const { container } = render(<MathText value={`${bad} <img src=x onerror=alert(1)>`} />);
  expect(screen.getByText(bad, { exact: false })).toBeTruthy();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("math")).toBeNull();
});
