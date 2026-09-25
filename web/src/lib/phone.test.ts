import { describe, expect, it } from "vitest";

import { normalizeEgyptianPhone } from "./phone";

describe("normalizeEgyptianPhone", () => {
  it.each([
    ["01001234567", "+201001234567"],
    ["1001234567", "+201001234567"],
    ["+20 100 123 4567", "+201001234567"],
    ["00201001234567", "+201001234567"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeEgyptianPhone(input)).toBe(expected);
  });

  it.each(["", "02001234567", "+14155552671", "0100123456", "010012345678"])(
    "rejects %s",
    (input) => expect(normalizeEgyptianPhone(input)).toBeNull(),
  );
});
