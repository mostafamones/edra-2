import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { main, parseArgs } from "./cli.mjs";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
// Empty environment: the dry-run must need no credentials, network or database.
const run = (args) => spawnSync(process.execPath, [cli, ...args], { env: {}, encoding: "utf8" });

describe("S6 dry-run CLI", () => {
  it("succeeds with an empty environment and prints a masked summary", () => {
    const result = run(["dry-run", "--reference-date", "2026-10-21", "--seed", "edra-20-v1", "--students", "20"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Sessions \(ended\) 72 \| roster entries 360/);
    assert.match(result.stdout, /Validation: passed \(0 errors\)/);
    assert.match(result.stdout, /^open exam: (open|not yet open|window expired at \S+)$/m);
    assert.match(result.stdout, /^upcoming exam: (open|not yet open|window expired at \S+)$/m);
    assert.doesNotMatch(result.stdout, /\+201\d{8}\b/, "phones must be masked");
  });

  it("fails on an invalid reference date before doing any work", () => {
    const result = run(["dry-run", "--reference-date", "2026-02-30"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /real YYYY-MM-DD date/);
  });

  it("fails with insufficient history when no complete teaching week exists", () => {
    const result = run(["dry-run", "--reference-date", "2026-08-20"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /insufficient history/i);
  });

  it("rejects a student count other than 20", () => {
    const result = run(["dry-run", "--students", "21"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Only --students 20/);
  });

  it("rejects unknown actions and options", () => {
    assert.equal(run(["reset"]).status, 2);
    assert.equal(run(["dry-run", "--force", "yes"]).status, 2);
  });

  it("rejects --out outside the gitignored out folder", () => {
    const result = run(["dry-run", "--out", "/tmp/scenario.json"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /inside scripts\/dev-academy\/out/);
  });
});

const PROJECT = "fgbcjlibwgxylfwmocgx";
const RUN = "11111111-2222-4333-8444-555555555555";
const DEVELOPER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const HASH = "a".repeat(64);

describe("dev-academy cloud argument parsing", () => {
  it("accepts valid create, inspect and verify argument sets", () => {
    const create = parseArgs(["create", "--project", PROJECT, "--run", RUN, "--developer", DEVELOPER, "--skip-delivery-probe"]);
    assert.equal(create.action, "create");
    assert.equal(create.options.skipDeliveryProbe, true);
    assert.equal(create.options.run, RUN);
    assert.equal(parseArgs(["inspect", "--project", PROJECT, "--run", RUN]).options.project, PROJECT);
    assert.equal(parseArgs(["verify", "--project", PROJECT, "--run", RUN, "--mode", "integrity"]).options.mode, "integrity");
  });

  it("rejects unknown actions, unknown options and options not allowed for the action", () => {
    assert.throws(() => parseArgs(["wipe"]), /Unknown action/);
    assert.throws(() => parseArgs(["dry-run", "--force", "yes"]), /Unknown option "--force"/);
    assert.throws(() => parseArgs(["create", "--project", PROJECT, "--run", RUN, "--developer", DEVELOPER, "--out", "x.json"]), /--out is not valid for create/);
    assert.throws(() => parseArgs(["inspect", "--project", PROJECT, "--run", RUN, "--mode", "baseline"]), /--mode is not valid for inspect/);
    assert.throws(() => parseArgs(["dry-run", "--project", PROJECT]), /--project is not valid for dry-run/);
  });

  it("requires the mandatory options of each action", () => {
    assert.throws(() => parseArgs(["create", "--project", PROJECT, "--run", RUN]), /--developer is required for create/);
    assert.throws(() => parseArgs(["inspect", "--run", RUN]), /--project is required for inspect/);
    assert.throws(() => parseArgs(["verify", "--project", PROJECT, "--run", RUN]), /--mode is required for verify/);
  });

  it("validates UUIDs, the project ref, students and mode before any work", () => {
    assert.throws(() => parseArgs(["inspect", "--project", PROJECT, "--run", "not-a-uuid"]), /--run must be a lowercase UUID/);
    assert.throws(() => parseArgs(["inspect", "--project", PROJECT, "--run", DEVELOPER.toUpperCase()]), /--run must be a lowercase UUID/);
    assert.throws(() => parseArgs(["inspect", "--project", PROJECT.toUpperCase(), "--run", RUN]), /--project must be/);
    assert.throws(() => parseArgs(["create", "--project", PROJECT, "--run", RUN, "--developer", "bad", "--students", "20"]), /--developer must be a lowercase UUID/);
    assert.throws(() => parseArgs(["dry-run", "--students", "19"]), /Only --students 20/);
    assert.throws(() => parseArgs(["verify", "--project", PROJECT, "--run", RUN, "--mode", "other"]), /--mode must be baseline or integrity/);
  });

  it("rejects repeated flags and treats a value given to a boolean flag as an unknown option", () => {
    assert.throws(() => parseArgs(["dry-run", "--seed", "a", "--seed", "b"]), /may be given only once/);
    assert.throws(() => parseArgs(["create", "--project", PROJECT, "--run", RUN, "--developer", DEVELOPER, "--skip-delivery-probe", "--skip-delivery-probe"]), /may be given only once/);
    assert.throws(() => parseArgs(["create", "--project", PROJECT, "--run", RUN, "--developer", DEVELOPER, "--skip-delivery-probe", "yes"]), /Unknown option "yes"/);
  });

  it("requires --project and --run for reset and validates --impact-hash and --confirm-run", () => {
    assert.throws(() => parseArgs(["reset", "--run", RUN, "--dry-run"]), /--project is required for reset/);
    assert.throws(() => parseArgs(["reset", "--project", PROJECT, "--dry-run"]), /--run is required for reset/);
    assert.throws(() => parseArgs(["reset", "--project", PROJECT, "--run", RUN, "--impact-hash", "ABC"]), /--impact-hash must be 64 lowercase hex/);
    assert.throws(() => parseArgs(["reset", "--project", PROJECT, "--run", RUN, "--confirm-run", "nope"]), /--confirm-run must be a lowercase UUID/);
    assert.equal(parseArgs(["reset", "--project", PROJECT, "--run", RUN, "--dry-run"]).options.dryRun, true);
  });

  it("rejects --dry-run combined with --confirm-run or --impact-hash", () => {
    assert.throws(() => parseArgs(["reset", "--project", PROJECT, "--run", RUN, "--dry-run", "--confirm-run", RUN]), /cannot be combined/);
    assert.throws(() => parseArgs(["reset", "--project", PROJECT, "--run", RUN, "--dry-run", "--impact-hash", HASH]), /cannot be combined/);
  });

  it("returns usage code 2 for a missing explicit env file without network access", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const code = await main(["create", "--project", PROJECT, "--run", RUN, "--developer", DEVELOPER, "--env", "/nonexistent/dev-academy.env"]);
      assert.equal(code, 2);
    } finally {
      console.error = original;
    }
  });
});

describe("reset refusal", () => {
  it("refuses destructive reset with exit 2 before any environment or network access", async () => {
    const original = console.error;
    const messages = [];
    console.error = (message) => messages.push(message);
    try {
      const code = await main(["reset", "--project", PROJECT, "--run", RUN, "--confirm-run", RUN, "--impact-hash", HASH]);
      assert.equal(code, 2);
      assert.match(messages.join("\n"), /Destructive reset is not enabled in this version/);
    } finally {
      console.error = original;
    }
  });
});
