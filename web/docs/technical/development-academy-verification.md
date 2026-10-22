# Development academy and Developer mode verification

Verification record for the [development tools plan](../../planning/development-tools/README.md) tasks 1–7, run 2026-10-21. Results are **Passed**, **Pending** or **Not run**. Browser acceptance is **Pending**: it is the owner's manual step and must pass before merge.

## Target

| Item | Value |
| --- | --- |
| Source | Branch `feat/development-academy` from `15f00ec` |
| Development project | `edra-1` (`fgbcjlibwgxylfwmocgx`), schema `20261021054218` |
| Development run | `be8db1dc-6eb2-48af-9c0b-c02d531f43ac`, state `ready`, recipe `edra-dev-v1`, seed `edra-20-v1`, reference date 2026-10-21 |
| Development academy | `02bf25b2-49df-e305-2d71-7590c36ca312`, slug `edra-dev-be8db1dc` |
| Real developer | `1de4d007-11ec-4290-85f6-73f8937ce083`, the only allowlisted developer; Instructor in the academy, and still a member of its one other academy |

## Schema and Edge Functions

- Migrations `20261021052402_development_tooling_registry` and `20261021054218_development_preview_sessions` are applied to the development project. They are additive: private `edra_private` tables, `service_role`-only RPC adapters and the narrowed `edra_auth.session_allowed()` check for generated accounts.
- `database.types.ts` gained only the 12 new `dev_*` function signatures. The remote `session_content` blocks from an unmerged branch were deliberately left out.
- Deployed no-delivery guards on `edra-1`: `send-whatsapp-auth` v31, `account-contact` v2, `account-password` v2, `student-onboarding` v4. Each checks `dev_delivery_blocked` before logging or development routing and fails closed when that lookup fails.

## Dataset (development run)

`verify --mode baseline` and `--mode integrity`: **Passed**, with exact baseline counts:

| Records | Count |
| --- | --- |
| Auth accounts / registry accounts loaded | 26 / 26 (6 staff, 20 students) |
| Memberships | 7 (6 generated + real developer as Instructor) |
| Student records / linked records | 20 / 20 |
| Groups / schedules / slots | 4 / 4 / 8 |
| Ended sessions / live sessions | 72 / 0 |
| Roster entries / attendance records | 360 / 360 |
| Attendance publications / items | 72 / 360 |
| Assignments (closed historical + current) | 20 (16 + 4) |
| Assignment recipients / marks / publications | 100 / 160 / 76 |
| Exams (8 historical + 1 open + 1 upcoming) | 10 |
| Exam work / submissions / marks / publications / closures | 35 / 35 / 175 / 35 / 8 |
| Outbox effects / suppressed | 490 / 490 |

There is one registered run on `edra-1`. No generated account has signed in there, and no preview control has been opened yet.

## Automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Passed | |
| `npm run lint` | Passed | 0 errors; remaining warnings are in unrelated existing files |
| `next build` | Passed | Built into `.next-e2e` so the running development server was untouched |
| Vitest (whole app) | Passed | 126 files, 779 tests (1 skipped). Includes the development module (config, crypto, HTTP gating, paths, client resolver, frame and menu components) |
| `npm run test:dev-academy` | Passed | 91 tests: scenario, validation, names, registry, credentials, connection, create, verify, CLI and reset |
| `npm run test:edge` and `test:edge:runtime` | Passed | Deno check plus 4 runtime suites, including synthetic-recipient blocking |

Database assertion evidence now comes from disposable GitHub Actions runs; the retired preview-check harness is removed. This record does not establish a new CI run.

## No-delivery evidence

- All 490 generated attendance, assignment and exam result effects are suppressed in `edra_private.dev_effect_suppressions`.
- Generated contacts are reserved in `dev_contacts`, and the deployed Edge guards refuse codes to them before any provider call or development-recipient routing. The hosted probe passed during `create`.
- No real OTP or message was sent during this work.

## Reset (Task 7)

`reset --dry-run` is read-only. It is a single `SELECT` that discovers the current schema's academy-scoped tables, their foreign-key children and the generated-user tables at run time. It also reports refusal conditions and an impact hash. Development run output: 35 scoped tables, 5 child FK paths (4 with rows), `profiles` 26 / `student_profiles` 20, 26 masked accounts, 0 active controls, **Refusals: none**, impact hash `69fadf8b…0267`.

```bash
npm run dev:academy -- reset --dry-run --project fgbcjlibwgxylfwmocgx --run be8db1dc-6eb2-48af-9c0b-c02d531f43ac
```

An unregistered run or a run belonging to another project is refused. A destructive invocation (`--confirm-run`, `--impact-hash`) always exits 2 without connecting. Execution needs a separately approved brief covering the child-first table list, trigger exceptions, cyclic pointers and backup location. No reset was executed.

## Running it locally

1. From `web/`, `npm run dev` (port 3000). The ignored `web/.env.local` points at `edra-1` and sets `EDRA_DEV_MODE_ENABLED`, `EDRA_DEV_PROJECT_REF`, `EDRA_DEV_DEVELOPER_IDS`, `EDRA_DEV_ACADEMY_ENCRYPTION_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Developer mode is off in production builds and whenever any of these is missing or mismatched.
2. Open `http://app.lvh.me:3000` and sign in with your normal password.
3. In the academy switcher, pick the synthetic academy: staff `http://app.lvh.me:3000/edra-dev-be8db1dc`, students `http://learn.lvh.me:3000/edra-dev-be8db1dc`.

## Manual browser acceptance (Pending)

1. The synthetic academy appears in normal academy switching, and your role there is Instructor.
2. In the account menu, choose **Developer mode**. You land as the generated Owner, with the frame and the **Viewing academy as** bar.
3. Switch through Owner, Head Admin, Admin and two instructors. Confirm a manager-only action (for example, archiving a student) is allowed as a manager and denied as an Instructor.
4. In Students, use a row's **View as student**. The student portal opens in the frame. Use **Return to staff**: the previous staff identity and directory filters/page come back. Repeat with a second student.
5. **Exit preview** returns your real account. Exit with no preview open, then use **View as student** from your own Instructor directory. **Return to staff** restores your real Instructor identity, and **Exit preview** ends the control.
6. With a second tab open, switch identity and check that the other tab reloads.
7. Check the bar and menus at mobile width, and by keyboard.
8. Make one attendance or marking change in preview. Afterwards, run `verify --mode integrity` and expect it to pass. Baseline counts may legitimately differ after such a change.

## Limitations

- Browser journeys have not been run. The frame layout (sidebar offset, wrapping on mobile), the cross-tab reload and the identity `Select` are covered only by component tests and code review.
- On `edra-1`, no control has been opened, because that needs your real password session.
- BroadcastChannel only reaches tabs on the same origin. Staff and student tabs pick up identity changes through the existing focus and navigation revalidation.
- Expansion to 300–500 students and reset execution are outside this scope.
