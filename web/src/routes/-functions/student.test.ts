import { describe, expect, it } from "vitest";
import { academyListRedirect } from "./student";
describe("academy list redirects", () => {
  it("drops academy and repeated values while preserving single raw strings", () => {
    const url = academyListRedirect("courses", "school", "?academy=other&q=1e3&view=list&view=grid&empty=");
    const query = new URL(url, "https://learn.example").searchParams;
    expect(query.get("academy")).toBe("school");
    expect(query.get("q")).toBe("1e3");
    expect(query.has("view")).toBe(false);
    expect(query.get("empty")).toBe("");
  });
});
