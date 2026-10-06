# Student codes

Optional, academy-scoped student codes. A code is an extra identifier for an annual student record; it never replaces the profile/record UUIDs. Schema: `supabase/migrations/20261006140000_student_code_foundation.sql`. Database assertions: `supabase/tests/student_codes.sql` and cases 11–12 in `supabase/tests/concurrency.sh`.

This slice (Plan 01) covers configuration and the ledger foundation only. It issues no codes. Individual assignment (Plan 02), generation (Plan 03), Students-page integration and lifecycle hooks (Plan 04), and code check-ins (Plan 05) build on the contracts below.

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

- `student_code_assignments` contains every issued code: the academy, year, academy profile, annual record, issuing level, code, `code_version`, the issuer and time, and the retirer, time, and reason (`manual`, `level_changed`, or `year_closed`). `(academy_id, code)` is unique for every issued code, including retired ones. A partial unique index allows at most one current code per annual record. Rows cannot be deleted or retargeted, and the only permitted update is a single current → retired change. `manual` requires `retired_by`.
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

- `change_student_code(academy, record, action, code, expected_version, request_key)` (definer, `authenticated`) is the only staff write path. `action` is `assign` (manual, normalized, must match the level's format), `replace` (retires the current code and issues the new manual code in one transaction; the old code stays reserved) and `replace_release` (same, but the old code is marked `released` and may be issued again, including to another student; uniqueness of `(academy, code)` ignores released rows), `generate` (next value of the level's effective format), or `retire` (explicit, reason `manual`). Returns `{ code, version }`. Server action: `changeStudentCode`.
- All staff roles may change a code on an active record in the open year. Assignment never replaces a current code (`code_exists`); retirement is its own call and leaves the student uncoded.
- Errors: `forbidden`, `validation` (hint `code`), `not_found`, `codes_disabled`, `archived_record`, `year_unavailable`, `stale_code`, `code_exists`, `code_taken`, `code_exhausted`, `pattern_missing`, `idempotency_conflict`.
- Idempotency: `student_code_requests` stores the result per `(academy, request_key)` with the caller and a fingerprint of action, record, expected version, and normalized code. The same caller and payload replay the result; anything else is `idempotency_conflict`. Failed calls store nothing.
- Lock order: settings row `FOR SHARE` (assign/generate only), record `FOR UPDATE`, then the ledger triggers (year, state) and the allocation counter. Retirement skips the settings lock, so it works while codes are off.
- UI: `StudentCodeDialog` (`components/dialog.tsx`) opens from the students table action menu and from the edit sheet. It commits independently of the contact form and never touches an open draft. Entry points appear only while codes are on and the record is active.
- `peek_next_student_code(academy, record)` returns the next unissued value of the record's format without reserving it or moving the cursor; the dialog's wand button fills it into the field, and the staff member still submits. Server action: `peekNextStudentCode`.

## Retired codes

- Manage → Student codes lists every retired code with its former student (`list_retired_student_codes`, caller authority, paged, searchable). Codes released by a change are not listed.
- **Unretire** (`unretire_student_code`, Owner/Admin, works while codes are off) moves a retired code to `released`: it stops being reserved and can be issued to any student. It does not return the code to its former holder. The ledger row stays; the trigger allows only this one-way change to a retired row.
