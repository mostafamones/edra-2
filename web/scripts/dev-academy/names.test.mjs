import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FAMILY_NAMES, FATHER_NAMES, FIRST_NAMES } from "./names.mjs";
import { buildScenario } from "./scenario.mjs";
import { normalizeEgyptianPhone } from "./validate.mjs";

const scenario = buildScenario();
const people = [...scenario.staff, ...scenario.students];

describe("S3 names and synthetic contacts", () => {
  it("composes every name from the curated first, father and family lists", () => {
    for (const person of people.filter((p) => p.displayName)) {
      const [first, father, ...family] = person.displayName.split(" ");
      assert.ok(FIRST_NAMES.includes(first), `first name ${first}`);
      assert.ok(FATHER_NAMES.includes(father), `father name ${father}`);
      assert.ok(FAMILY_NAMES.includes(family.join(" ")), `family name ${family.join(" ")}`);
    }
  });

  it("gives every contact a phone that passes the Egyptian mobile rule, unchanged by normalization", () => {
    for (const person of people.filter((p) => p.phone)) {
      assert.equal(normalizeEgyptianPhone(person.phone), person.phone, person.key);
    }
  });

  it("keeps phones and names unique across staff and students", () => {
    const phones = people.filter((p) => p.phone).map((p) => p.phone);
    const names = people.filter((p) => p.displayName).map((p) => p.displayName);
    assert.equal(new Set(phones).size, phones.length);
    assert.equal(new Set(names).size, names.length);
  });

  it("marks every generated person synthetic and leaves the real-owner placeholder unmarked", () => {
    for (const person of people.filter((p) => !p.placeholder)) assert.equal(person.synthetic, true, person.key);
    const placeholder = scenario.staff.find((s) => s.placeholder);
    assert.equal(placeholder.key, "staff:real-owner");
    assert.equal(placeholder.synthetic, undefined);
  });
});
