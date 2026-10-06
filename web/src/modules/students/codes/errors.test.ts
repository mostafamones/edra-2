import { describe, expect, it } from "vitest";

import { failureFromDatabase } from "./errors";

describe("failureFromDatabase", () => {
  it("maps stable codes and field hints", () => {
    expect(failureFromDatabase({ code: "P0001", message: "stale_settings" })).toMatchObject({ code: "stale_settings" });
    expect(failureFromDatabase({ code: "P0001", message: "forbidden" })).toMatchObject({ code: "forbidden" });
    expect(failureFromDatabase({ code: "P0001", message: "validation", hint: "level:grade-10" }))
      .toMatchObject({ code: "validation", fieldErrors: { "level:grade-10": expect.any(String) } });
    expect(failureFromDatabase({ code: "P0001", message: "validation", hint: "default_pattern" }))
      .toMatchObject({ fieldErrors: { defaultPattern: expect.any(String) } });
  });

  it("maps individual code changes", () => {
    for (const code of ["code_exists", "stale_code", "code_taken", "invalid_format", "codes_disabled", "code_exhausted", "idempotency_conflict"]) {
      expect(failureFromDatabase({ code: "P0001", message: code })).toMatchObject({ code });
    }
    expect(failureFromDatabase({ code: "P0001", message: "validation", hint: "code" }))
      .toMatchObject({ fieldErrors: { code: expect.any(String) } });
  });

  it("hides unknown errors", () => {
    expect(failureFromDatabase({ code: "42501", message: "permission denied for table x" })).toMatchObject({ code: "unavailable" });
    expect(failureFromDatabase({ code: "P0001", message: "something_else" })).toMatchObject({ code: "unavailable" });
  });
});
