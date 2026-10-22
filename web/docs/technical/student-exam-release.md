# Standalone student exam release verification — EDRA-236

Verification record for the integrated EDRA-232–235 standalone exam journey (parent EDRA-83), run 2026-10-20 (19:35–20:35 UTC). Results are **Passed**, **Failed**, **Not run** or **Not applicable**. The evidence type is stated for each result: CI database (disposable instance), unit (Vitest), direct RPC (real user JWT against hosted PostgREST), connected browser (authenticated Chromium → local web server → cloud database/Storage/worker), or catalog (read-only SQL).

## Target

| Item | Value |
| --- | --- |
| Tested source | `origin/main` `30ae1e0` plus the two fixes below (branch `student-exam-release-verification`, uncommitted at the time of writing) |
| Web server | Local `next dev` (Next.js 16.3.5) on `http://learn.lvh.me:3100`, configured from `web/.env.local` with the server signing key. Production `next start` correctly refuses non-HTTPS origins, so no production-mode HTTP run was possible |
| Hosted deployment | **None identified.** There are no GitHub deployments and no deployment configuration in the repository. No hosted artifact was verified |
| Database / Storage / worker | Cloud project `edra-1` (`fgbcjlibwgxylfwmocgx`), the application's configured shared development project |
| Browser | Playwright 1.64.1 Chromium 156.0.8078.4, headless (headless shell and full `chromium` channel), Linux/WSL2 |
| CI | `CI` run 39455956095 on `30ae1e0`: web, edge, e2e and database jobs passed |

## Schema, types and configuration

- **Migration history (catalog).** `edra-1` records `20261020000456_student_exam_entry`, `20261020004701_student_exam_answering`, `20261020123036_student_exam_departure_context` and `20261020132535_student_exam_review`. When inspection started, 235 and five non-exam repository migrations were missing. A concurrent session recorded them between 19:38 and 19:41 UTC. This verification applied **no** migrations.
- **Function drift (catalog): Passed.** The bodies (`pg_proc.prosrc`, whitespace-normalized) of all 50 functions defined by the four exam migrations match the latest repository definitions. Review RPC grants are `authenticated` only; the private helpers are owner-only.
- **Remaining non-exam drift.** `assignment_marks_search` is recorded as `20261018110415` instead of the repository's `20261018160000`. `20261019210000_session_content` (from unmerged commit `ee59bbf`) is applied but is absent from `main`. Preserve recorded shared-project history; fixture-suite verification runs on disposable CI databases built from the checkout.
- **Types: Passed.** TypeScript types generated from `edra-1` (Management API) were compared with `src/lib/supabase/database.types.ts`. Every exam table/RPC block matches. The EDRA-235 hand-added declarations were semantically identical; their position and the argument order of `save_my_exam_answers`/`submit_my_exam` were aligned to the generator. The only remaining differences are the seven `session_content` blocks from the unmerged migration, which were deliberately not added.
- **Deadline worker (catalog): Passed.** `edra-exam-deadlines` (every 30 s, `run_exam_deadlines(50)`) is active: 2,875 succeeded / 0 failed runs in the preceding 24 h.
- **Storage (catalog): Passed.** The `assignment-images` bucket is private (5 MB, image types) and only staff have select/insert policies.
- **Configuration gap.** The main checkout's `web/.env.local` has no `SUPABASE_SERVICE_ROLE_KEY`, so private exam images cannot be signed from that development server. The verification worktree used the project's secret key in its ignored `.env.local`. Any deployment must set it server-side.

## Database assertions

| Check | Result | Evidence |
| --- | --- | --- |
| `exams`, `student_exams`, `student_exam_answering`, `student_exam_review`, `assessment_exposure`, `student_enrollment`, `session_authority` and the other 25 suites | Passed | CI database, run 39455956095 (32 suites, PostgreSQL 17 disposable instance) |
| Concurrency harness, including exam scenarios 26–33, 42 and 46–47 | Passed | Same CI run |

The fixes below change only browser code, so they do not affect these results. The CI run for the fixed head will happen once it is pushed.

## Defects found and fixed

1. **Account establishment wiped editor tokens on every reload.** *Failed, then Passed after the fix.* `setExamJournalAccount` starts from an unknown account, and the AuthProvider sets the account after the page mounts. So the first call after any page load counted as an account change and removed every `edra:exam-editor:*` sessionStorage token. A refresh during an exam therefore lost the claim token. Pending departures could not be replayed ("A previous editor's pending departure could not be authorized"), and Resume then waited for the 45 s lease to expire.
   - Fix (`student/answering/cleanup.ts`): the tab records which account owns its tokens (`edra:exam-editor-account`) and keeps them only when the same account is established again. Sign-out or a different account still clears them. Listeners now receive the new account.
   - Regression test: `cleanup.test.ts` "keeps this tab's editor tokens when a reload establishes the same account". It fails on the old code.
2. **Qualified review vanished on full page load.** *Failed, then Passed after the fix.* For the same reason, `StudentExamReviewSection` cleared itself as soon as the AuthProvider resolved. The review was only visible after client-side navigation, although its images were still signed.
   - Fix (`student/components/review.tsx`): the review ignores a notification for its own account.
   - Regression test: `review.test.tsx` "keeps material when a page load establishes the same account". It fails on the old code.

## Connected acceptance matrix

All rows are connected-browser evidence unless marked otherwise. DB state was checked with read-only SQL after each step.

### A. Discovery, authority and pre-start exposure

| Case | Result |
| --- | --- |
| Overview read, refresh and back create no attempt; the overview HTML (including the server payload) contains no prompts, choices or notes | Passed |
| Eligible nonparticipant's list shows only open/upcoming work; closed never-participated exams are excluded. Participant's list shows own history | Passed (direct RPC) |
| Pre-start overview payload has no question material or keys | Passed (direct RPC) |
| Second academy, suspended, unconnected and staff-as-student callers get `student_link_unavailable` for list/overview/review/start; anonymous callers are denied | Passed (direct RPC) |
| Foreign exam id and guessed id → `not_found`; wrong academy → `student_link_unavailable` | Passed (direct RPC) |
| Legacy `save_exam_answers`, `submit_exam_attempt` and `record_exam_departure` → permission denied. Student calls to staff `get_exam`/`list_exam_students` → null. Raw `exam_submission_answers`, `exam_online_answers`, `exam_marks`, `exam_editor_claims` and `exam_departures` → 403; `exams`, `exam_questions` and `exam_choices` → empty | Passed (direct RPC) |
| Recovery-only sessions, closed-year contexts and attached exams | Not run here; covered by the CI suites |

### B. Start, answer and save

| Case | Result |
| --- | --- |
| The Start click acquires document fullscreen, then starts exactly one attempt with its deadline | Passed |
| Unsupported capability (`fullscreenEnabled` false) and refused `requestFullscreen` create no attempt; the overview and closed history stay usable | Passed (capability simulated by an init script) |
| A second browser context with the same cookies is refused ("open in another tab or device"); a second tab in the same browser is refused by the Web Lock | Passed |
| Choice/text answers, numbered navigation, blanks and authored images; 390 px mobile viewport without horizontal overflow; keyboard selection | Passed |
| Out-of-order/429/5xx responses and conflict reconciliation | Not run here (unit tests cover them) |

### C. Interruption, ownership and cleanup

| Case | Result |
| --- | --- |
| Refresh mid-exam: same attempt and deadline, token kept, Resume re-enters fullscreen in about 4 s, warning restored behind Continue, saved and draft answers present | Passed after fix 1 |
| Offline edit shows "Offline · Kept on this device" and syncs on reconnection | Passed |
| Tab closed while offline, then reopened in a new tab: the old departure is reported once as undeliverable, Resume waits out the old lease, and the offline edit is recovered from IndexedDB and saved | Passed (documented best-effort token-loss behavior) |
| Sign-out from the account menu clears editor tokens, the token-owner marker and departure breadcrumbs | Passed. The IndexedDB journal was already flushed in this run; its purge is covered by unit tests |
| Audience move during an attempt: further saves are refused ("isn't assigned to you"), the saved answer is kept, and the overview shows Not available with history | Passed |
| Insecure HTTP origin (no Web Locks): token reuse is withheld and the client waits for lease expiry, as designed | Observed. Production HTTPS has Web Locks; the main runs treated the origin as secure |

### D. Fullscreen and departures

| Case | Result |
| --- | --- |
| First and second departures (programmatic `exitFullscreen`) show Warning 1 of 2 and 2 of 2. Controls are hidden while blocked. Return to fullscreen requires a click, then Continue | Passed |
| Refresh while in fullscreen is the next departure (pagehide keepalive, HTTP 200). As the third departure it kicked the attempt exactly once and graded the saved work (DB: ordinals 1–3, `kicked`) | Passed (s1 and s2 on the Automatic exam) |
| Navigating the tab to another page during an attempt records one departure | Passed |
| Image dialog opens and closes inside fullscreen without a departure | Passed |
| Browser tab switch (`bringToFront`) does not change visibility in headless Chromium, so it was not exercised. OS Escape, app switch and minimize were not exercised | Not run (environment) |
| **Limitation:** after a kick caused by a refresh, the first overview render can race the keepalive and still show In progress. The first Resume then reports the undeliverable departure once; the next read shows Submitted. There is no extra penalty and the attempt is not revived | Observed (low severity) |

### E. Submission, timer and source arbitration

| Case | Result |
| --- | --- |
| The confirmation dialog shows the unanswered count, and submission with a blank is accepted; the dialog stays visible in fullscreen | Passed |
| Timer: an abandoned 1-minute attempt was finalized as `timer` at its deadline by the worker 2 s later, with the browser closed | Passed |
| Window closes first: a 30-minute attempt was capped in the UI (03:23 remaining) and finalized as `window_closed` at actual closure by the worker (effective 19:55:52, processed 19:56:05) | Passed |
| Timer equal to actual closure; scheduled close vs headroom boundaries | Not run (connected); covered by CI `exams.sql` |
| Physical confirmation while an online attempt is active: paper wins, the attempt is superseded and both losing draft rows are preserved | Passed (staff RPCs via SQL; student browser) |

### F. Results, solutions and images

| Case | Result |
| --- | --- |
| Automatic exam: the official total appears immediately (kicked work graded normally); review stays locked until actual closure, then shows answers beside keys, original numbering and solution notes | Passed after fix 2 |
| Manual mixed exam: Awaiting result (no partial score) while the online review is available at closure | Passed |
| Paper announced before closure: review after closure shows the accepted paper choice (not the losing online draft) and "Completed on paper" | Passed |
| Paper closed before announcement: "Awaiting result / Available after your result is published"; after announcement the review appears | Passed |
| Review has no question maxima, marks, feedback or revisions; the legacy `get_my_exam` qualified projection has no question `max_score` or departures | Passed (browser HTML and direct RPC) |
| Exclusion recalculation without announcement leaves the official total unchanged (0.00 / 5.00). The announced correction shows 0.00 / 4.00, Corrected with its date, and the Excluded badge | Passed |
| Active and review images load from hosted Storage through server-signed 60-second URLs (`token` lifetime 60 s). An expired URL returns HTTP 400. Review images need no editor or fullscreen | Passed |
| Foreign-academy and guessed image ids are not authorized (`image_ids: []`) | Passed (direct RPC) |

## Fixtures (shared `edra-1`, retained)

Created through the Auth admin API and staff RPCs under dedicated identities, never touching real students. Accepted submissions, departures and publications are preserved history and were not deleted.

- Academies: `81555ff7-872a-449f-b79d-e25eae237767` (`edra236-a`) and `5a997f13-dfa5-4af2-b044-62509cf3d5d7` (`edra236-b`).
- Exams: Automatic `118e0e46-9df1-4a6f-8362-b9318cafc5cf`, Mixed `c71356ab-0cd7-4151-a3fb-48ead3953e3e`, Timer `b0e4317f-5f62-41d8-bf8c-56f9c08e54d6`, Window `b72310b8-bec1-400e-959c-61a4f006eb54`, Recovery `3504b1d7-d589-4b8d-bd58-ef6ebd77b678`, Paper `8a9db7ae-4649-4607-b03d-c0622133609d`, Capability `3d0c925a-ffa7-4f58-b7ab-323ad4adc594`, Other academy `5c9526f7-87f2-4d6e-be45-8cf852208a3a`.
- Accounts (auth user ids): owner `76dad4e8-cc52-4361-9f6a-4c9d302babb2`, owner B `7e93593c-a298-4c27-94fa-02c3cba687ed`, students `5c98d7ee-b6be-4d38-9d9f-bad46fabb53f`, `b1b36aeb-4cf7-48cf-abe4-f16ea0d6b632`, `c63b85cd-5e5a-4954-bca3-0d615d7ab686`, `39fdb3d4-3183-4328-8236-b32c0a2e26e2`, outsider `8824ee9d-8d9d-4119-975f-7f06b3122adb`, suspended `03378138-e2be-49f2-9037-773bc368fd46`, moved `2b9a947c-5464-4c11-9eb7-6174627d5735`, unconnected `4eae9624-bd5f-4b39-9a92-a12a1a0e07e8`. No phone numbers or credentials are recorded here.
- Five generated PNGs in `assignment-images` under the two academy prefixes. At 20:31 UTC: 10 attempts, 10 submission rows, 12 departures and 8 result publications. The Capability exam's two running attempts are settled by the worker at its actual closure (20:47:19 UTC).

## Source checks (final tree)

| Command | Result |
| --- | --- |
| `npm run lint` | Passed (8 existing warnings outside exams) |
| `npm run typecheck` | Passed |
| `npx vitest run` | Passed: 682 tests, 1 existing skip |
| `npm run build` | Passed |
| `npm run test:e2e` | Passed: 4 signed-out smoke tests (isolated placeholder configuration) |
| `npm run test:edge` | Not applicable (no Edge Function changes) |

## Disposition

The standalone logic, authority and disclosure rules pass in CI and in a connected browser against the cloud database, Storage and worker. Two client defects that would have broken refresh recovery and the qualified review in any hosted run were fixed with regression tests. **EDRA-236 is not yet releasable/Done.** The remaining release conditions are:

1. Push the fixes and obtain a passing CI run, including the database job, for that head.
2. Deploy that head to an HTTPS environment with `SUPABASE_SERVICE_ROLE_KEY` set server-side, then rerun the connected journey there. No hosted artifact exists yet.
3. Test Firefox, Safari and real Android/iOS hardware, including OS-level Escape, app switch and minimize. Only Chromium was available.

EDRA-83 keeps its content-attached integration and deferred media (answer uploads, solution videos) as explicit remainder; this record does not deliver them.
