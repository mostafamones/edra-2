// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { academyDateTime } from "@/lib/academy-time";
import { AssessmentDateTime } from "./date-time";

afterEach(cleanup);
const cairoDate = (offsetDays: number) => academyDateTime(new Date(Date.now() + offsetDays * 86_400_000).toISOString()).date;

it("adds how far the date is from today in Cairo when asked", () => {
  render(<AssessmentDateTime id="at" label="At" relative value={`${cairoDate(7)}T12:00`} onChange={() => {}} />);
  expect(screen.getByRole("button", { name: /\(in 7d\)$/ })).toBeTruthy();
  cleanup();
  render(<AssessmentDateTime id="at" label="At" relative value={`${cairoDate(0)}T12:00`} onChange={() => {}} />);
  expect(screen.getByRole("button", { name: /\(today\)$/ })).toBeTruthy();
  cleanup();
  render(<AssessmentDateTime id="at" label="At" value={`${cairoDate(7)}T12:00`} onChange={() => {}} />);
  expect(screen.queryByRole("button", { name: /\(in/ })).toBeNull();
});
