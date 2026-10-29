# Staff Home

The daily overview prioritizes actionable work, today's teaching and active enrollment. It replaces the initial session-history/navigation pilot. It does not replace the Sessions page or report academic performance.

## Scope and definitions

- Needs attention: ended, unarchived sessions with attendance draft revision newer than the official revision; units explicitly submitted for review (manager roles only); submitted online assignments with at least one part missing a mark. Assignment items count students with submitted work, not missing submissions. Quiz/exam and physical marking are not included in this first queue. The UI names online assignment submissions explicitly.
- The queue shows the oldest eight tasks; the count covers all matching tasks. Each row opens its actual session, unit or assignment. No action is performed by opening Home.
- Students: unarchived annual records in the open year, grouped by grade and participation type. These are enrolled records, not linked-account counts. Online means `online_only`; grade and participation summaries link to the existing student filters.
- Today: the first twelve planned occurrences in Cairo's current calendar date, including separate times for schedules with multiple slots. Live activity uses the existing Sessions infinite-query contract and opens attendance. Planned times are not actual start times. Schedules remains the complete plan.
- No open year: show the status rather than implying an empty academy. Unknown/failed reads never become zero counters or an all-clear state.

## Data, authority and freshness

`staff_home` is a protected read-only aggregate. It checks the caller's live academy role, uses a fixed empty search path, explicitly restricts every academy/year source, and returns no contact details. Submission tables remain private; a corrective migration changes the projection to SECURITY DEFINER rather than granting browser table reads. Existing destination commands still authorize independently. Instructor responses omit manager publication tasks.

One overview RPC replaces the history read; the separate live query retains its existing key and thirty-second refresh. Overview cache keys include academy, with a thirty-second stale window and minute refresh. Existing auth lifecycle clears account/preview data. The request receives cancellation. Presentation and student navigation require no additional summary endpoint.

## Verification

Component tests cover real task destinations, student filter links, independent live failure and error-versus-zero behavior. The existing live-cache tests remain. Browser fixtures render the real view using synthetic data; they do not prove persistence. `supabase/tests/staff_home.sql` is registered for disposable GitHub CI only and covers manager/instructor projection, cross-academy, suspended, student and anonymous denial. CI has not run for these local changes.

The owner's running Edge app loaded 21 active records, one online record, two grades and two planned classes with no pending tasks. This verifies a real empty queue; populated attention/live states still need browser review. No server was started by the agent. No push or PR is authorized in this turn.

Latest checks: seven Home view/cache/response tests passed with Vitest's thread pool; TypeScript passed; repository lint passed with five existing warnings. Production webpack build passed using the separate `.next-e2e` output after an initial restricted-filesystem EPERM. The online enrollment card was followed in Edge and correctly opened the Online only filter with Nour as its single result. UI browser suite discovery still includes all thirteen cases, but those fixtures were not executed because the owner has no preview server running on 3101. Disposable database assertions remain unrun until GitHub CI.
