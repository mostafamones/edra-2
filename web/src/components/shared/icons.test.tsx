// @vitest-environment jsdom
import { createRef } from "react";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { IconFlagFilled, IconPlus } from "./icons";

it("renders one SVG, passes props and ref, and fixes the stroke width", () => {
  const ref = createRef<SVGSVGElement>();
  const { container, rerender } = render(<IconPlus ref={ref} className="example" aria-label="Add" data-test="icon" stroke={1.75} strokeWidth={3} />);
  const svg = container.firstElementChild;
  expect(container.children).toHaveLength(1);
  expect(svg?.tagName.toLowerCase()).toBe("svg");
  expect(ref.current).toBe(svg);
  expect(svg?.getAttribute("stroke-width")).toBe("1.5");
  expect(svg?.getAttribute("stroke")).not.toBe("1.75");
  expect(svg?.getAttribute("class")).toBe("example");
  expect(svg?.getAttribute("aria-label")).toBe("Add");
  expect(svg?.getAttribute("data-test")).toBe("icon");
  expect(svg?.getAttribute("width")).toBe("24");
  expect(svg?.getAttribute("height")).toBe("24");
  rerender(<IconPlus size={18} />);
  expect(container.firstElementChild?.getAttribute("width")).toBe("18");
  expect(container.firstElementChild?.getAttribute("height")).toBe("18");
});

it("fills the flag with the current color", () => {
  const { container } = render(<IconFlagFilled />);
  expect(container.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
  expect(container.querySelector("path")?.getAttribute("fill")).toBeNull();
});
