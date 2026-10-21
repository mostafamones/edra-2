import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULTS, buildScenario } from "./scenario.mjs";
import { plannedUserId, scenarioAccounts, setStateSql, uuid } from "./registry.mjs";

const RUN = "11111111-2222-4333-8444-555555555555";
const OTHER_RUN = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const TOKEN = "99999999-8888-4777-8666-555555555555";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("plannedUserId", () => {
  it("is deterministic, UUID-shaped, and differs per run and logical id", () => {
    const id = plannedUserId(RUN, "student:a");
    assert.equal(plannedUserId(RUN, "student:a"), id);
    assert.match(id, UUID_SHAPE);
    assert.notEqual(plannedUserId(OTHER_RUN, "student:a"), id);
    assert.notEqual(plannedUserId(RUN, "student:b"), id);
  });
});

describe("scenarioAccounts", () => {
  const accounts = scenarioAccounts(buildScenario(DEFAULTS), RUN);

  it("returns 26 accounts: 6 staff and 20 students", () => {
    assert.equal(accounts.length, 26);
    const kinds = accounts.map((a) => a.kind).sort();
    assert.deepEqual(kinds.filter((k) => k === "student").length, 20);
    assert.deepEqual(kinds.filter((k) => k !== "student"), ["admin", "head_admin", "instructor", "instructor", "instructor", "owner"]);
  });

  it("uses unique phones, including 20 parent phones", () => {
    const phones = [...accounts.map((a) => a.phone), ...accounts.map((a) => a.parentPhone).filter(Boolean)];
    assert.equal(phones.length, 46);
    assert.equal(new Set(phones).size, 46);
  });
});

describe("registry guards", () => {
  it("uuid rejects uppercase and malformed values", () => {
    assert.equal(uuid(RUN), RUN);
    assert.throws(() => uuid(OTHER_RUN.toUpperCase()), /lowercase UUID/);
    assert.throws(() => uuid("garbage"), /lowercase UUID/);
    assert.throws(() => uuid(42), /lowercase UUID/);
  });

  it("setStateSql rejects an unknown state", () => {
    assert.throws(() => setStateSql(RUN, TOKEN, "bogus"), /Unknown run state/);
    assert.match(setStateSql(RUN, TOKEN, "ready"), /state = 'ready'/);
  });
});
