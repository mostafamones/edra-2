# Student codes

Optional, academy-scoped student codes. A code is an extra identifier for an annual student record; it never replaces the profile/record UUIDs. Schema: `supabase/migrations/20261006140000_student_code_foundation.sql`. Database assertions: `supabase/tests/student_codes.sql` and cases 11–12 in `supabase/tests/concurrency.sh`.

Plan 01 covers configuration and the ledger foundation; Plans 02–04 added individual changes, generation, and the Students page. `supabase/migrations/20261006270000_student_code_checkin.sql` (Plan 05) adds permanent reservation, the lifecycle retirement hooks, and code check-in; where earlier text below conflicts with the section [Permanent reservation and lifecycle](#permanent-reservation-and-lifecycle-plan-05), that section wins.

## Configuration

- `student_code_settings`: one row per academy with `enabled`, a draft `default_pattern` (may be empty only while disabled), and a monotonic `version`. A missing row reads as disabled at version 0.
- `student_code_level_patterns`: optional overrides keyed by `(academy_id, level_id)`, with a foreign key to the academy's own `academy_levels`. The effective formula is the level override, otherwise the default.
- `save_student_code_settings(academy, expected_version, enabled, default_pattern, levels)` replaces the configuration and overrides atomically for owners and admins. A changed version returns `stale_settings` and writes nothing. Foreign or unknown levels return `invalid_level`. Disabling keeps formulas, assignments, counters, and history.
- Owners and admins configure. Instructors read through `get_student_code_settings` or RLS. Nonmembers get `forbidden`.

## Grammar (`pattern.ts` ↔ SQL `normalize_student_code*`)

- Outer ASCII whitespace is trimmed, then only `[A-Za-z0-9-]` is accepted (`#` also in formulas), and ASCII letters are uppercased. Digits and leading zeroes are kept. Codes are strings, never numbers.
- Formula: a prefix of 0–12 characters plus one trailing block of 1–8 `#`. `####` has an empty prefix and width 4. `ST2###` has prefix `ST2` and width 3. Values run from 1 to 10^width − 1, after which allocation returns `code_exhausted`.
- A code, whether manual or generated, has 1–20 characters. Keep `pattern.test.ts` and the SQL parity block in step.

## Ledger

- `student_code_assignments` contains every issued code: the academy, year, academy profile, annual record, issuing level, code, `code_version`, the issuer and time, and the retirer, time, and reason (`manual`, `level_changed`, or `year_closed`). Every issued string is reserved permanently (see Plan 05 below); the ledger itself may hold the same string on several rows from the former release feature, so uniqueness is enforced by the reservation registry. A partial unique index allows at most one current code per annual record. Rows cannot be deleted or retargeted, and the only permitted update is a single current → retired change. `manual` requires `retired_by`.
- `student_code_states` holds, per annual record, a monotonic code-state `version` and the `current_assignment_id` pointer. Ledger triggers maintain it. A record without a row has version 0. Each issue and each retirement increments the version, so a form loaded before a retirement cannot pass an ABA-style check.
- The issue trigger requires codes to be enabled, the record to be active, the stated level to match the record's level, and the year to be open. Otherwise it raises `codes_disabled`, `not_found`, `archived_record`, `level_mismatch`, or `year_unavailable`. It also requires no current code (`code_exists`) and `code_version` equal to the next state version (`stale_code`).
- Retirement does not check enablement or year, so lifecycle retirement works while codes are disabled and after a year closes.
- `student_code_counters` holds the highest allocated value per `(academy, prefix, width)`. Disabling or editing a formula never resets it, and switching back to a formula resumes where it stopped.
- Authenticated users have no direct write privilege on any of these tables.

## Contracts for later slices

| Need | Contract |
|---|---|
| Enabled flag, formulas, settings version | `get_student_code_settings(academy)` (invoker) · `getStudentCodeSettings` in `@/modules/students/server` |
| Effective formula for a level | `student_code_effective_pattern(academy, level)` (invoker) · `getEffectiveStudentCodePattern` |
| Current code and code-state version | `get_student_code_state(academy, record)` (invoker) · `getStudentCodeState` |
| Next generated code | `allocate_student_code(academy, level)`: internal and not granted to `authenticated`. Call it from a definer RPC that holds the settings share lock, and insert the assignment in the same transaction. It skips values already issued, for example through overlapping formulas or manual codes. |
| Issue a code | Insert into `student_code_assignments` with `code_version = current version + 1` from a definer RPC that checks actor, role, and tenant. |
| Retire a code | Update the current assignment with `retired_at`, `retirement_reason`, and `retired_by` (required for `manual`). |
| Normalize manual input | `normalizeStudentCode` / `normalize_student_code` |

## Lock graph

Acquire locks in this order. Skipping a rank is fine; going backwards is not.

1. **Settings row** (`student_code_settings`). Saving, disabling, and enabling take `FOR UPDATE` and no other row lock. Issuance, manual retirement, generation, and code check-in take `FOR SHARE` first.
2. **Attendance session** (code check-in only): `FOR NO KEY UPDATE`, as in `lock_attendance_session`.
3. **Annual student records**: `FOR UPDATE`, in ascending id order for batches.
4. **Academic year**: `FOR SHARE`, through `validate_student_record_write` and the issue trigger.
5. **Code state rows**: written by the ledger triggers.
6. **Allocation counters**: in ascending `(prefix, width)` order.

Lifecycle retirement (level change in `update_student_record`, year close) runs inside operations that already hold record or year locks. It must not take the settings lock. Because settings writers hold only the settings row, neither record↔settings nor session↔settings can form a cycle. Existing student RPC ordering (record → year → group) is unchanged.

## Individual changes (Plan 02)

- `change_student_code(academy, record, action, code, expected_version, request_key)` (definer, `authenticated`) is the only staff write path. `action` is `assign` (manual, normalized, must match the level's format), `replace` (retires the current code and issues the new manual code in one transaction; the old code stays reserved forever), `generate` (next value of the level's effective format), or `retire` (explicit, reason `manual`). Returns `{ code, version }`. Server action: `changeStudentCode`.
- All staff roles may change a code on an active record in the open year. Assignment never replaces a current code (`code_exists`); retirement is its own call and leaves the student uncoded.
- Errors: `forbidden`, `validation` (hint `code`), `not_found`, `codes_disabled`, `archived_record`, `year_unavailable`, `stale_code`, `code_exists`, `code_taken`, `code_exhausted`, `pattern_missing`, `idempotency_conflict`.
- Idempotency: `student_code_requests` stores the result per `(academy, request_key)` with the caller and a fingerprint of action, record, expected version, and normalized code. The same caller and payload replay the result; anything else is `idempotency_conflict`. Failed calls store nothing.
- Lock order: settings row `FOR SHARE` (assign/generate only), record `FOR UPDATE`, then the ledger triggers (year, state) and the allocation counter. Retirement skips the settings lock, so it works while codes are off.
- UI: `StudentCodeDialog` (`components/dialog.tsx`) opens from the students table action menu and from the edit sheet. It commits independently of the contact form and never touches an open draft. Entry points appear only while codes are on and the record is active.
- `peek_next_student_code(academy, record)` returns the next unissued value of the record's format without reserving it or moving the cursor; the dialog's wand button fills it into the field, and the staff member still submits. Server action: `peekNextStudentCode`.

## Retired codes

- Manage → Student codes lists every retired code with its former student (`list_retired_student_codes`, caller authority, paged, searchable). Historical `released` rows are listed too (shown as retired by staff). There is no release or unretire action: retired codes stay reserved and are never issued again, to the former holder or anyone else.

## Bulk generation (Plan 03)

Schema: `supabase/migrations/20261006240000_student_code_generation.sql`. Assertions: `supabase/tests/student_code_generation.sql`.

- Scope (exactly one): `all` active records in the open year, `levels` (academy levels), or `groups` (active groups of the open year, matched on `primary_group_id`). Ids are deduplicated server-side (max 100); foreign or unknown ids are `invalid_target`. Archived records are never targets. Students without a group are included in All and Level runs.
- `preview_student_code_generation(academy, mode, ids)` (definer, every staff role, codes on): `{ settingsVersion, token, targets, coded, missing, patterns: [{ pattern, levelIds, missing, available, examples }], missingFormat: [{ levelId, missing }] }`. Formats sharing a prefix and width share a counter and appear once. `available` counts the remaining range minus already-issued codes in it. `examples` are the next free values right now and are advisory. Reserves nothing. Server action: `previewStudentCodeGeneration`.
- `generate_student_codes(academy, mode, ids, expected_version, preview_token, request_key)` (definer, every staff role, codes on) issues every missing code of the scope in one transaction, or nothing. `token` is an md5 of the settings version and every missing record with its format; if it no longer matches after the records are locked, the run returns `stale_preview` and the UI reloads the summary. Levels without a format (`pattern_missing`, hint level id) and formats without enough values (`code_exhausted`, hint format) fail the whole run before any write. A manual assignment racing the run for the same value returns `code_taken` (hint `generation`), also with nothing written. Server action: `generateStudentCodes`.
- Result: `{ targets, assigned, skipped, mode, ids, settingsVersion, order: "name" }`. Codes are issued in `lower(full_name), full_name, id` order; numbers are identifiers, not ranks. The result is stored in `student_code_requests` under the request key (fingerprint: mode, ids, expected version, token), so a retry after a lost response replays the original counts. A different payload with the same key is `idempotency_conflict`.
- Locks: settings `FOR SHARE`, target records `FOR UPDATE` by ascending id (scope rechecked on each locked row; that locked set is the run's target set), open year `FOR SHARE`, state rows via triggers, then every counter the run uses `FOR UPDATE` in ascending `(prefix, width)` before allocation. Students added after a run stay uncoded until another run or an individual assignment.
- Numbering options (`20261006250000_student_code_generation_options.sql`, corrective): optional trailing arguments `start` (null continues after the format's counter), `step` (1–1000) and `parity` (`any`, `even`, `odd`) on both RPCs. They select the progression `first, first+e, …` where `e` is the step (doubled when the step is odd and a parity is chosen) and `first` is the start moved up by one if its parity is wrong. Issued strings are still skipped, `available` counts only free progression values, the options are part of the token and the idempotency fingerprint, and the counter only moves forward (`greatest`). A start below the counter may use unissued gaps.
- UI: Manage → Student codes → Bulk generation, for every staff role. The section is faded and inert while codes are off, and the server refuses runs (`codes_disabled`). A retry after an unknown network outcome reuses the same request key. **View students** links to the Students page filtered by the level or group when exactly one was chosen, otherwise to all students.
- Not measured: the single-transaction run has not been timed on a representative maximum academy. Each issued code costs a few indexed queries plus the ledger triggers, and the run must finish within the `authenticated` role's statement timeout.

## Permanent reservation and lifecycle (Plan 05)

Schema: `supabase/migrations/20261006270000_student_code_checkin.sql`. Assertions: `supabase/tests/student_code_checkin.sql`, `student_code_changes.sql`, and cases 13–17 in `concurrency.sh`.

- **Every issued string is reserved forever.** `student_code_reservations(academy_id, code)` is seeded from the distinct historical strings (no ledger row is changed) and claimed by a `BEFORE INSERT` trigger on `student_code_assignments`, so every issuance path (manual, replace, generated, bulk, direct RPC) must claim a never-issued value atomically; a taken value fails with `code_taken`. Allocation and peeking skip every issued value.
- The reuse behavior is withdrawn. `change_student_code` rejects `replace_release`, and `unretire_student_code` always raises `code_release_removed`; the ledger trigger no longer allows any change to a retired row. The web controls (release switch, Unretire button) are removed. Ordinary `replace` and `retire` remain.
- **Ambiguity.** A string historically issued to different students is ambiguous; code check-in answers `student_code_ambiguous` for it. The fix is a normal replacement of the active holder, which leaves all history intact. Historical repetition for the same student is not ambiguity, but the string is still unavailable for new issuance.
- **Lifecycle hooks.** A real `level_id` change on an annual record retires its active code (`level_changed`, trigger `annual_student_records_retire_code`). Closing an academic year (`closed_at` set) retires that year's active codes (`year_closed`, trigger `academic_years_retire_codes`). Both run inside the owning update, take no settings lock, and work while codes are disabled; new annual records get no code. Existing stale assignments are not backfilled (review queries in `planning/phone-attendance-api-handoff.md`).
- **Code check-in.** `check_in_attendance_by_code(academy, session, code, key, late_after_minutes)` (definer, `authenticated`) normalizes the code, takes settings (share) → session → record (share) → year (share), requires codes enabled, rejects ambiguous strings, revalidates the active assignment under the record lock (current, unarchived, issuing level equals current level, record year equals the session's year), then uses the shared engine `edra_private.apply_check_in`. Errors: `student_codes_disabled`, `student_code_not_found`, `student_code_retired`, `student_code_ambiguous`, plus the attendance errors. The public wrapper charges `op:attendance_check_in` once. The receipt stores the resolved record and assignment in `attendance_requests.resolved`; a replay never resolves a new holder.
