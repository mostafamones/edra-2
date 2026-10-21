import { describe, expect, it } from "vitest";

import { academyProfileSchema } from "./validation";

const base = { name: "Magd Academy", icon: "school", subject: "Mathematics", phone: "", whatsapp: "" };
const parse = (change: Record<string, unknown>) => academyProfileSchema.safeParse({ ...base, ...change });

describe("academy profile validation", () => {
  it("normalizes local and international Egyptian mobile spellings", () => {
    for (const spelling of ["01012345678", "1012345678", "+201012345678", "00201012345678", "201012345678", "010 1234-5678"]) {
      expect(parse({ phone: spelling }).data?.phone).toBe("+201012345678");
    }
    expect(parse({ whatsapp: "01512345678" }).data?.whatsapp).toBe("+201512345678");
  });

  it("clears each contact independently and allows the same number in both", () => {
    expect(parse({ phone: "   ", whatsapp: "01112345678" }).data).toMatchObject({ phone: null, whatsapp: "+201112345678" });
    expect(parse({ phone: "01112345678", whatsapp: null }).data).toMatchObject({ phone: "+201112345678", whatsapp: null });
    expect(parse({ phone: "01212345678", whatsapp: "+201212345678" }).success).toBe(true);
  });

  it("rejects landlines, foreign numbers and invalid prefixes", () => {
    for (const phone of ["0223456789", "+447700900123", "01312345678", "0101234567", "phone"]) {
      expect(parse({ phone }).success).toBe(false);
      expect(parse({ whatsapp: phone }).success).toBe(false);
    }
  });

  it("matches the database name, subject and icon limits", () => {
    expect(parse({ name: " A " }).success).toBe(false);
    expect(parse({ name: "a".repeat(100) }).success).toBe(true);
    expect(parse({ name: "a".repeat(101) }).success).toBe(false);
    expect(parse({ name: "  Magd  " }).data?.name).toBe("Magd");
    expect(parse({ subject: " " }).success).toBe(false);
    expect(parse({ subject: "Robotics & AI" }).success).toBe(true);
    expect(parse({ subject: "s".repeat(61) }).success).toBe(false);
    expect(parse({ icon: "rocket" }).success).toBe(false);
  });

  it("rejects identity and metadata fields instead of ignoring them", () => {
    for (const field of ["slug", "id", "created_by", "updated_at"]) {
      expect(parse({ [field]: "x" }).success).toBe(false);
    }
  });
});
