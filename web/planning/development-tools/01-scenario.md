# Task 1 — deterministic scenario builder

Read AGENTS.md, web/AGENTS.md, web/docs/engineering.md; final development-tools product sections Dataset and First-run exclusions; this brief and the README's Fixed recipe and counts. No database access is needed.

## Allowed edits and outputs

Create `web/scripts/dev-academy/{scenario,names,validate,cli}.mjs`, adjacent focused tests, and a short CLI README. Add `dev:academy` to web/package.json, invoking the CLI with the existing Node runtime. Use built-in Node modules; no dependency is needed. No application source, SQL migration or cloud writes in this task.

Export `buildScenario({recipeVersion, seed, referenceDate, students:20})` and `validateScenario(scenario)`. A JSON scenario contains config, logical staff/student identities, placements, schedules, session/attendance events, assignment work/results and exam work/results. Real Auth IDs, passwords and database credentials do not belong in it. Stable IDs derive from logical keys, not array position that changes when adding a later feature.

CLI contract:
- `npm run dev:academy -- dry-run --reference-date 2026-10-21 --seed edra-20-v1 --students 20`.
- stdout: masked summary/counts/validation status; optional explicit local JSON export is gitignored.
- Reject unknown actions/options and student counts other than 20. Never silently scale.
- No credentials required and no network import in the pure scenario builder.

## Recipe details

Use the exact fixed recipe in README. Weekdays use Cairo calendar dates; convert each event to UTC using the real zone offset for its date. Do not apply today's UTC offset to every date. Assign the four groups distinct Monday/Thursday and Tuesday/Friday 90-minute teaching slots, split between 16:00 and 18:00 starts. Distribute session starters and graders round-robin across the three generated instructors; these are authorship patterns, not new permission rules.

Attendance weights:
- consistent: Present .90, Late .05, Absent .03, Excused .02;
- improving: Present rises from .65 to .90, Late .05, Excused .05, remaining probability Absent;
- temporary dip: Present .90 normally, .60 during the middle two complete weeks; Late .05, Excused .05, remainder Absent;
- irregular: Present .55, Late .15, Absent .25, Excused .05.

Score baselines: consistent 84%, improving linearly 55–85%, temporary dip 82% with a 22-point middle-period dip, irregular 65%. Add deterministic bounded noise of ±10 percentage points per assessment and ±5 per component; clamp to [0,max] and use at most two decimal places. Derive official totals from component marks, never independently randomize them. Rates are weights, not claims of exact measured outcomes in a 20-student sample.

For historical assignment work, receive probability .95 for consistent/improving/temporary dip and .70 for irregular. Received historical work is fully marked and announced; current assignments supply the deliberate pending cases. On each current assignment, its five students get one of: expected/missing; received unmarked; private marked; announced; late and announced. Rotate the five states across groups so named students do not all share the same edge case.

Historical exams use the same receive probabilities; received paper work is marked and announced. No fabricated online attempts. Keep all accepted work, grading, announcement and closure times in order. Current open exam has no seeded work; upcoming exam opens after the reference date. Use one-hour timer; actual closure is scheduled closure + 2 minutes. A resumed future execution must report when those windows have naturally expired instead of changing the stored scenario.

## Acceptance

S1: Default counts exactly match README.
S2: Same inputs produce byte-identical normalized scenario output; different seed changes names/pattern events.
S3: Names are plausible compositions from local curated lists. Contacts match current Egyptian mobile validation and uniqueness; they are explicitly synthetic, never assumed unowned.
S4: Every reference resolves, group placement is compatible, no event precedes enrollment or falls outside its academic year, and scores/totals agree.
S5: All four performance patterns and five current-assignment cases exist.
S6: Dry-run succeeds with no environment credentials; invalid reference/count/options fail before any network/database operation.

Tests: use built-in node:test for focused S1–S6 assertions in adjacent .test.mjs files. Add `test:dev-academy` invoking `node --test scripts/dev-academy/*.test.mjs`; do not change broad app test discovery. Run lint/build as required. Return the scenario schema and command examples as the handoff to task 2.
