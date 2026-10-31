import { expect, it, vi } from "vitest";
vi.mock("../actions", () => ({}));
import { unitAction } from "./unit-action";

const draft = { published_revision: 0 }, live = { published_revision: 2 };

it("saves a version until first publication, then publishes or submits edits", () => {
  expect(unitAction(draft, { editable: true, manager: true, changed: true })).toBe("version");
  expect(unitAction(live, { editable: true, manager: true, changed: true })).toBe("publish");
  expect(unitAction(live, { editable: true, manager: false, changed: true })).toBe("submit");
  expect(unitAction(live, { editable: true, manager: true, changed: false })).toBeNull();
  expect(unitAction(draft, { editable: false, manager: true, changed: true })).toBeNull();
});
