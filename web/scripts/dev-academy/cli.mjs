#!/usr/bin/env node
// Dev academy CLI. dry-run is pure. create, inspect and verify act on one allow-listed cloud project and read
// credentials from the environment or an env file; credential values are never printed.
//   dry-run  [--recipe ID] [--reference-date YYYY-MM-DD] [--seed TEXT] [--students 20] [--out FILE.json]
//   create   --project REF --run UUID --developer UUID [--recipe ID] [--reference-date ...] [--seed ...] [--students 20] [--env FILE] [--skip-delivery-probe]
//   inspect  --project REF --run UUID [--env FILE]
//   verify   --project REF --run UUID --mode baseline|integrity [--recipe ID] [--reference-date ...] [--seed ...] [--students 20] [--env FILE]
// Without --recipe, create and verify use the recipe a registered run was created with, else the latest recipe.
//   reset    --project REF --run UUID --dry-run [--env FILE]   (read-only impact report; destructive reset is refused)
// --out writes only inside the gitignored out/ folder.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { createSqlRunner, managementToken, resolveTarget } from "./connection.mjs";
import { loadKey } from "./credentials.mjs";
import { createRun, probeDeliveryGuard } from "./create.mjs";
import { inspectRun } from "./inspect.mjs";
import { resetDryRun } from "./reset.mjs";
import { runRowSql, scenarioHash } from "./registry.mjs";
import { DEFAULTS, RECIPE_VERSIONS, buildScenario, validateScenario } from "./scenario.mjs";
import { isCalendarDate } from "./time.mjs";
import { MODES, verifyRun } from "./verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "out");
const MIGRATIONS = join(HERE, "../../supabase/migrations");
const ACTIONS = new Set(["dry-run", "create", "inspect", "verify", "reset"]);
const SCENARIO_OPTIONS = ["--recipe", "--reference-date", "--seed", "--students"];
const ALLOWED = {
  "dry-run": [...SCENARIO_OPTIONS, "--out"],
  create: ["--project", "--run", "--developer", ...SCENARIO_OPTIONS, "--env", "--skip-delivery-probe"],
  inspect: ["--project", "--run", "--env"],
  verify: ["--project", "--run", "--mode", ...SCENARIO_OPTIONS, "--env"],
  reset: ["--project", "--run", "--env", "--dry-run", "--confirm-run", "--impact-hash"],
};
const REQUIRED = { create: ["--project", "--run", "--developer"], inspect: ["--project", "--run"], verify: ["--project", "--run", "--mode"], reset: ["--project", "--run"] };
const KNOWN = new Set(Object.values(ALLOWED).flat());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT = /^[a-z]{20}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const RESET_REFUSAL = "Destructive reset is not enabled in this version. It requires a separately approved reset brief with the reviewed child-first table list, trigger exceptions, cyclic pointer handling and encrypted backup location.";
const USAGE = [
  "Usage: npm run dev:academy -- <action> [options]",
  "  dry-run  [--recipe ID] [--reference-date YYYY-MM-DD] [--seed TEXT] [--students 20] [--out scripts/dev-academy/out/NAME.json]",
  "  create   --project REF --run UUID --developer UUID [--recipe ID] [--reference-date YYYY-MM-DD] [--seed TEXT] [--students 20] [--env FILE] [--skip-delivery-probe]",
  "  inspect  --project REF --run UUID [--env FILE]",
  "  verify   --project REF --run UUID --mode baseline|integrity [--recipe ID] [--reference-date YYYY-MM-DD] [--seed TEXT] [--students 20] [--env FILE]",
  `  recipes: ${RECIPE_VERSIONS.join(", ")} (default ${DEFAULTS.recipeVersion}; create/verify default to a registered run's recipe)`,
  "  reset    --project REF --run UUID --dry-run [--env FILE]",
].join("\n");

class UsageError extends Error {}

export function parseArgs(argv) {
  const [action, ...rest] = argv;
  if (!ACTIONS.has(action)) throw new UsageError(`Unknown action "${action ?? ""}"`);

  const options = {
    recipe: null, referenceDate: DEFAULTS.referenceDate, seed: DEFAULTS.seed, students: DEFAULTS.students, out: null,
    project: null, run: null, developer: null, mode: null, envFile: null, skipDeliveryProbe: false,
    dryRun: false, confirmRun: null, impactHash: null,
  };
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (!KNOWN.has(flag)) throw new UsageError(`Unknown option "${flag}"`);
    if (!ALLOWED[action].includes(flag)) throw new UsageError(`${flag} is not valid for ${action}`);
    if (seen.has(flag)) throw new UsageError(`${flag} may be given only once`);
    seen.add(flag);

    if (flag === "--skip-delivery-probe") {
      options.skipDeliveryProbe = true;
      continue;
    }
    if (flag === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const value = rest[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${flag} needs a value`);

    switch (flag) {
      case "--recipe":
        if (!RECIPE_VERSIONS.includes(value)) throw new UsageError(`Unknown recipe "${value}"; supported recipes: ${RECIPE_VERSIONS.join(", ")}`);
        options.recipe = value;
        break;
      case "--reference-date":
        if (!isCalendarDate(value)) throw new UsageError(`--reference-date must be a real YYYY-MM-DD date, got "${value}"`);
        options.referenceDate = value;
        break;
      case "--seed":
        options.seed = value;
        break;
      case "--students":
        if (value !== "20") throw new UsageError(`Only --students 20 is supported, got "${value}"`);
        break;
      case "--out": {
        // Keeps generated scenario files inside the gitignored folder.
        const target = resolve(value);
        const rel = relative(OUT_DIR, target);
        if (rel.split(sep)[0] === ".." || isAbsolute(rel) || !rel.endsWith(".json")) {
          throw new UsageError(`--out must be a .json file inside scripts/dev-academy/out/`);
        }
        options.out = target;
        break;
      }
      case "--project":
        if (!PROJECT.test(value)) throw new UsageError("--project must be a 20-character lowercase project ref");
        options.project = value;
        break;
      case "--run":
      case "--developer":
        if (!UUID.test(value)) throw new UsageError(`${flag} must be a lowercase UUID`);
        options[flag === "--run" ? "run" : "developer"] = value;
        break;
      case "--mode":
        if (!MODES.has(value)) throw new UsageError(`--mode must be baseline or integrity, got "${value}"`);
        options.mode = value;
        break;
      case "--env":
        options.envFile = value;
        break;
      case "--confirm-run":
        if (!UUID.test(value)) throw new UsageError("--confirm-run must be a lowercase UUID");
        options.confirmRun = value;
        break;
      case "--impact-hash":
        if (!HEX64.test(value)) throw new UsageError("--impact-hash must be 64 lowercase hex characters");
        options.impactHash = value;
        break;
      default:
        throw new UsageError(`Unknown option "${flag}"`);
    }
  }
  for (const flag of REQUIRED[action] ?? []) {
    if (!seen.has(flag)) throw new UsageError(`${flag} is required for ${action}`);
  }
  if (action === "reset") {
    if (options.dryRun && (options.confirmRun || options.impactHash)) {
      throw new UsageError("--dry-run cannot be combined with --confirm-run or --impact-hash");
    }
    if (!options.dryRun && (options.confirmRun !== options.run || !options.impactHash)) {
      throw new UsageError("reset without --dry-run needs --confirm-run equal to --run and --impact-hash");
    }
  }
  return { action, options };
}

const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : "-");
const avg = (list) => (list.length ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) : "-");

// One line per student, keyed by logical key only: profile, realised attendance, hand-ins and marks over time.
function studentLines(scenario) {
  const groupName = new Map(scenario.groups.map((g) => [g.id, g.name]));
  const groupOf = new Map(scenario.placements.map((p) => [p.studentId, p.groupId]));
  const weeks = scenario.config.teachingWeeks.count;
  const weekOf = new Map([...scenario.assignments, ...scenario.exams].map((x) => [x.id, x.week]));
  const historical = new Set(scenario.assignments.filter((a) => a.kind === "historical").map((a) => a.id));
  const items = scenario.attendancePublications.flatMap((p) => p.items);
  return scenario.students.map((s) => {
    const mine = (list) => list.filter((r) => r.studentId === s.id);
    const attended = mine(items).filter((i) => i.status === "present" || i.status === "late").length;
    const work = mine(scenario.assignmentResults).filter((r) => historical.has(r.assignmentId));
    const exams = mine(scenario.examResults);
    const marked = [...mine(scenario.assignmentResults), ...exams]
      .filter((r) => r.total !== null)
      .map((r) => ({ week: weekOf.get(r.assignmentId ?? r.examId), total: r.total }));
    const half = (early) => avg(marked.filter((m) => (m.week <= weeks / 2) === early).map((m) => m.total));
    const totals = marked.map((m) => m.total);
    const profile = s.profile ? `${s.profile.tier} ${s.profile.ability} | attend ${s.profile.attendance} | submit ${s.profile.submission} | ` : "";
    return `  ${s.key} | ${groupName.get(groupOf.get(s.id))} | ${profile}${s.pattern} | attended ${pct(attended, mine(items).length)}`
      + ` | handed in ${work.filter((r) => r.receivedAt).length}/${work.length} | exams sat ${exams.filter((r) => r.receivedAt).length}/${exams.length}`
      + ` | marks avg ${avg(totals)} (early ${half(true)}, late ${half(false)}, low ${totals.length ? Math.min(...totals) : "-"})`;
  });
}

// Reports a stored exam window against the current clock; the scenario itself is never changed.
function examWindowStatus(exam, now) {
  if (now < Date.parse(exam.opensAt)) return "not yet open";
  if (now < Date.parse(exam.closesAt)) return "open";
  return `window expired at ${exam.closesAt}`;
}

function summarize(scenario, validation, now) {
  const count = (list, predicate) => list.filter(predicate).length;
  const tally = (pick) => Object.entries(Object.groupBy(scenario.students, pick)).map(([k, list]) => `${k} ${list.length}`).join(", ");
  const { config } = scenario;
  return [
    "Dev academy dry-run (pure build, no database or network access)",
    `Recipe ${config.recipeVersion} | seed ${config.seed} | reference ${config.referenceDate} | ${config.timezone}`,
    `Academic year ${config.academicYear.startsOn} to ${config.academicYear.endsOn} | teaching weeks ${config.teachingWeeks.count} (${config.teachingWeeks.firstStartsOn} to ${config.teachingWeeks.lastEndsOn})`,
    `Students ${scenario.students.length} in ${scenario.groups.length} groups | staff ${count(scenario.staff, (s) => !s.placeholder)} generated + ${count(scenario.staff, (s) => s.placeholder)} real-owner placeholder`,
    `Sessions (ended) ${scenario.sessions.length} | roster entries ${scenario.roster.length} | attendance publications ${scenario.attendancePublications.length} (items ${scenario.attendancePublications.reduce((n, p) => n + p.items.length, 0)})`,
    `Assignments ${count(scenario.assignments, (a) => a.kind === "historical")} historical + ${count(scenario.assignments, (a) => a.kind === "current")} current | assignment results ${scenario.assignmentResults.length}`,
    `Exams ${count(scenario.exams, (e) => e.kind === "historical")} historical + ${count(scenario.exams, (e) => e.kind === "open")} open + ${count(scenario.exams, (e) => e.kind === "upcoming")} upcoming | exam results ${scenario.examResults.length}`,
    ...scenario.exams.filter((e) => e.kind !== "historical").map((e) => `${e.kind} exam: ${examWindowStatus(e, now)}`),
    `Patterns: ${tally((s) => s.pattern)}`,
    ...(scenario.students[0].profile ? [`Tiers: ${tally((s) => s.profile.tier)}`] : []),
    "Students (marks are out of 100):",
    ...studentLines(scenario),
    `Validation: ${validation.valid ? "passed" : "failed"} (${validation.errors.length} errors)`,
  ].join("\n");
}

function dryRun(options) {
  try {
    const scenario = buildScenario(scenarioInputs(options, options.recipe ?? DEFAULTS.recipeVersion));
    const validation = validateScenario(scenario);
    console.log(summarize(scenario, validation, Date.now()));
    if (options.out) {
      mkdirSync(dirname(options.out), { recursive: true });
      writeFileSync(options.out, `${JSON.stringify(scenario, null, 2)}\n`);
      console.log(`Wrote ${relative(process.cwd(), options.out)}`);
    }
    return validation.valid ? 0 : 1;
  } catch (error) {
    console.error(`dry-run failed: ${error.message}`);
    return 1;
  }
}

/** Process environment overlaid by the env file (--env, else ./.env.local when present). */
function loadEnv(envFile) {
  const path = envFile ? resolve(envFile) : resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    if (envFile) throw new UsageError(`--env not found: ${envFile}`);
    return { ...process.env };
  }
  return { ...process.env, ...parseEnv(readFileSync(path, "utf8")) };
}

const scenarioInputs = (options, recipeVersion) => ({ recipeVersion, referenceDate: options.referenceDate, seed: options.seed, students: options.students });
const registeredRun = async (runSql, runId) => (await runSql(runRowSql(runId)))[0]?.result ?? null;

// An existing run is rebuilt with the recipe it was registered with unless --recipe says otherwise.
export function buildChecked(options, run) {
  const scenario = buildScenario(scenarioInputs(options, options.recipe ?? run?.recipe_version ?? DEFAULTS.recipeVersion));
  const validation = validateScenario(scenario);
  if (!validation.valid) throw new Error(`scenario is invalid (${validation.errors.length} errors)`);
  return scenario;
}

function printCounts(counts) {
  for (const [name, value] of Object.entries(counts ?? {})) console.log(`  ${name} ${value}`);
}

function printRun(runId, report, env, slug) {
  console.log(`Run ${runId} state ready`);
  console.log(`Academy ${report.academy_id}`);
  if (env.NEXT_PUBLIC_EDRA_APP_ORIGIN) console.log(`Staff URL ${env.NEXT_PUBLIC_EDRA_APP_ORIGIN}/${slug}`);
  if (env.NEXT_PUBLIC_EDRA_LEARN_ORIGIN) console.log(`Student URL ${env.NEXT_PUBLIC_EDRA_LEARN_ORIGIN}/${slug}`);
  printCounts(report.counts);
}

async function create(options, env, target, runSql) {
  const scenario = buildChecked(options, await registeredRun(runSql, options.run));
  console.log(`Recipe ${scenario.config.recipeVersion}`);
  const key = loadKey(env);
  const slug = `edra-dev-${options.run.slice(0, 8)}`;
  const result = await createRun({
    target, runSql, key, runId: options.run, developerId: options.developer, scenario, hash: scenarioHash(scenario), slug,
    migrationFiles: readdirSync(MIGRATIONS).filter((file) => /^\d+_.+\.sql$/.test(file)),
    lockToken: randomUUID(),
    probe: options.skipDeliveryProbe ? null : (account) => probeDeliveryGuard(target, env.SEND_SMS_HOOK_SECRET, account),
  });
  printRun(options.run, result.report, env, slug);
  return 0;
}

async function inspect(options, runSql) {
  const { run, counts } = await inspectRun({ runSql, runId: options.run });
  if (!run) {
    console.error("inspect failed: run is not registered");
    return 1;
  }
  console.log(`Run ${options.run} state ${run.state}`);
  console.log(`Academy ${run.academy_id ?? "none"}`);
  console.log(`Error stage ${run.error_stage ?? "none"}`);
  console.log(`Ready at ${run.ready_at ?? "none"}`);
  printCounts(counts);
  return 0;
}

async function verify(options, runSql) {
  const row = await registeredRun(runSql, options.run);
  const scenario = buildChecked(options, row);
  console.log(`Recipe ${scenario.config.recipeVersion}`);
  const result = await verifyRun({ runSql, runId: options.run, scenario }, options.mode);
  // A registered run must have been created from exactly these scenario inputs.
  const mismatch = row && row.scenario_hash !== scenarioHash(scenario);
  const problems = mismatch ? [...result.problems, "scenario inputs differ from the registered run"] : result.problems;
  const ok = result.ok && !mismatch;
  console.log(`Verification (${options.mode}): ${ok ? "passed" : "failed"}`);
  for (const problem of problems) console.log(`  - ${problem}`);
  printCounts(result.report?.counts);
  return ok ? 0 : 1;
}

async function reset(options, runSql) {
  const { report, refusals, hash } = await resetDryRun({ runSql, runId: options.run, projectRef: options.project });
  const academy = report.academy ? `${report.academy.id} ${report.academy.slug}` : "none";
  console.log(`Reset dry-run (read-only) for run ${options.run}`);
  console.log(`Project ${options.project} | academy ${academy} | state ${report.run?.state ?? "none"} | schema ${report.schema_version ?? "none"}`);
  console.log("Scoped tables:");
  for (const t of report.scoped_tables) if (t.rows > 0) console.log(`  ${t.table} ${t.rows}`);
  console.log("Child tables:");
  for (const t of report.child_tables) if (t.rows !== 0) console.log(`  ${t.table}.${t.column} -> ${t.references} ${t.rows ?? "needs review"}`);
  console.log("Generated-user tables:");
  for (const t of report.user_tables) if (t.rows > 0) console.log(`  ${t.table} ${t.rows}`);
  console.log(`Accounts ${report.accounts.length} (masked):`);
  for (const a of report.accounts) console.log(`  ${a.logical_id} ${a.kind} ${a.phone} ${a.state}`);
  console.log(`Active controls ${report.active_controls ?? 0}`);
  if (refusals.length === 0) {
    console.log("Refusals: none");
  } else {
    console.log("Refusals:");
    for (const reason of refusals) console.log(`  - ${reason}`);
  }
  console.log(`Impact hash ${hash}`);
  return refusals.length === 0 ? 0 : 1;
}

async function cloud(action, options) {
  try {
    const env = loadEnv(options.envFile);
    const target = resolveTarget(options.project, env);
    // Only the isolated test project may skip the delivery guard probe.
    if (options.skipDeliveryProbe && target.kind !== "isolated-test") {
      throw new UsageError("--skip-delivery-probe is allowed only on the isolated-test project");
    }
    const runSql = createSqlRunner(options.project, { token: managementToken(env) });
    if (action === "create") return await create(options, env, target, runSql);
    if (action === "inspect") return await inspect(options, runSql);
    if (action === "reset") return await reset(options, runSql);
    return await verify(options, runSql);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    console.error(`${action} failed: ${error.message}`);
    return 1;
  }
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  const { action, options } = parsed;
  // Destructive reset stays disabled: refused before any environment, target or network access.
  if (action === "reset" && !options.dryRun) {
    console.error(RESET_REFUSAL);
    return 2;
  }
  return action === "dry-run" ? dryRun(options) : cloud(action, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
