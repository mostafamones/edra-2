import { describe, expect, it } from "vitest";

import type { AssessmentRow } from "../types";
import { groupRows } from "./groups";

const row = (type: string, status: string, id: string) => ({ item: { type, status, id }, href: id, audience: "" }) as unknown as AssessmentRow;

describe("groupRows", () => {
  it("gives each group one unique key even when its rows are not adjacent", () => {
    // Results still ordered for the previous grouping, shown while the new one loads.
    const rows = [row("assignment", "active", "a1"), row("quiz", "closed", "q1"), row("exam", "open", "e1"), row("assignment", "active", "a2")];
    const groups = groupRows(rows, "status");
    expect(groups.map((group) => group.key)).toEqual(["active", "closed", "open"]);
    expect(groups[0].rows.map((r) => r.item.id)).toEqual(["a1", "a2"]);
    expect(groupRows(rows, "type").map((group) => group.key)).toEqual(["assignment", "quiz", "exam"]);
    expect(groupRows(rows, "none")).toEqual([{ key: "all", rows }]);
  });
});
