import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { impactHash, impactSql, refusals, resetDryRun } from "./reset.mjs";

const RUN = "11111111-2222-4333-8444-555555555555";
const PROJECT = "fgbcjlibwgxylfwmocgx";

/** A registered, ready run with nothing blocking the reset. */
function cleanReport() {
  return {
    run: { id: RUN, state: "ready", project_ref: PROJECT, academy_id: "aaaaaaaa-0000-4000-8000-000000000001", developer_id: "b".repeat(8) },
    academy: { id: "aaaaaaaa-0000-4000-8000-000000000001", slug: "edra-dev-11111111" },
    schema_version: "20261021054218",
    scoped_tables: [{ table: "attendance_records", rows: 12 }, { table: "students", rows: 0 }],
    child_tables: [{ table: "exam_marks", column: "result_id", references: "exam_results.id", rows: 3 }],
    user_tables: [{ table: "profiles", rows: 26 }],
    accounts: [{ logical_id: "account:student:a", kind: "student", user_id: null, state: "loaded", phone: "+2010******01" }],
    outside_memberships: 0,
    outside_student_profiles: 0,
    foreign_student_links: 0,
    foreign_staff: 0,
    storage_objects: 0,
    active_controls: 0,
  };
}

describe("impactSql", () => {
  it("rejects a non-UUID run ID", () => {
    assert.throws(() => impactSql("not-a-uuid"), /Run ID must be a lowercase UUID/);
    assert.throws(() => impactSql(`${RUN}'; drop table x; --`), /Run ID must be a lowercase UUID/);
  });

  it("is a single read-only statement with no write keywords", () => {
    const sql = impactSql(RUN);
    assert.match(sql, /^with r as \(select \* from edra_private\.dev_runs where id = '11111111-2222-4333-8444-555555555555'\)/);
    assert.equal(sql.trimEnd().split(";").filter((part) => part.trim() !== "").length, 1);
    for (const keyword of ["delete", "update", "insert", "truncate", "drop", "alter"]) {
      assert.doesNotMatch(sql, new RegExp(`\\b${keyword}\\b`, "i"), `keyword ${keyword} must not appear`);
    }
  });
});

describe("refusals", () => {
  it("returns no refusals for a clean ready report", () => {
    assert.deepEqual(refusals(cleanReport(), PROJECT), []);
  });

  it("allows a failed run as well", () => {
    const report = cleanReport();
    report.run.state = "failed";
    assert.deepEqual(refusals(report, PROJECT), []);
  });

  it("stops at an unregistered run", () => {
    assert.deepEqual(refusals({ ...cleanReport(), run: null }, PROJECT), ["run is not registered"]);
  });

  it("refuses a run from another project", () => {
    const report = cleanReport();
    assert.deepEqual(refusals(report, "abcdefghijklmnopqrst"), [`run belongs to project ${PROJECT}`]);
  });

  it("refuses a run whose state is not resettable", () => {
    const report = cleanReport();
    report.run.state = "loading";
    assert.deepEqual(refusals(report, PROJECT), ["run state loading is not resettable"]);
  });

  it("refuses a run without an academy", () => {
    const report = cleanReport();
    report.run.academy_id = null;
    assert.ok(refusals(report, PROJECT).includes("run has no academy"));
  });

  it("refuses each non-zero blocking count with its own message", () => {
    const cases = {
      outside_memberships: "generated accounts belong to other academies",
      outside_student_profiles: "generated students participate in other academies",
      foreign_student_links: "real accounts are linked as students in this academy",
      foreign_staff: "unexpected real staff in this academy",
      storage_objects: "storage objects reference this academy",
      active_controls: "developer preview controls are active",
    };
    for (const [field, message] of Object.entries(cases)) {
      const report = cleanReport();
      report[field] = 1;
      assert.deepEqual(refusals(report, PROJECT), [message], field);
    }
  });

  it("refuses foreign keys whose rows could not be counted", () => {
    const report = cleanReport();
    report.child_tables.push({ table: "pair_links", column: "a_id, b_id", references: "students", rows: null });
    assert.deepEqual(refusals(report, PROJECT), ["foreign key rows could not be counted: pair_links"]);
  });

  it("does not refuse multi-column foreign keys with counted rows", () => {
    const report = cleanReport();
    report.child_tables.push({ table: "pair_links", column: "a_id, b_id", references: "students", rows: 0 });
    assert.deepEqual(refusals(report, PROJECT), []);
  });
});

describe("impactHash", () => {
  it("is a stable sha256 hex digest independent of key order", () => {
    const reordered = Object.fromEntries(Object.entries(cleanReport()).reverse());
    const hash = impactHash(cleanReport());
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(impactHash(reordered), hash);
  });

  it("changes when a scoped row count changes", () => {
    const report = cleanReport();
    const changed = cleanReport();
    changed.scoped_tables[0].rows = 13;
    assert.notEqual(impactHash(changed), impactHash(report));
  });

  it("ignores active_controls", () => {
    const changed = cleanReport();
    changed.active_controls = 2;
    assert.equal(impactHash(changed), impactHash(cleanReport()));
  });
});

describe("resetDryRun", () => {
  it("runs the impact SELECT once and returns the report, refusals and hash", async () => {
    const report = cleanReport();
    const calls = [];
    const runSql = async (sql) => {
      calls.push(sql);
      return [{ result: report }];
    };
    const result = await resetDryRun({ runSql, runId: RUN, projectRef: PROJECT });
    assert.equal(calls.length, 1);
    assert.equal(calls[0], impactSql(RUN));
    assert.deepEqual(result, { report, refusals: [], hash: impactHash(report) });
  });
});
