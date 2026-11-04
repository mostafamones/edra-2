# Staff student records

Current staff-record implementation at /<academySlug>/students on the staff host. Intended rules are in [students](../../../../docs/product/domains/students.md). This module does not create authentication accounts; academy joining and account linking live in [enrollment](../enrollment/README.md).

## Model

- `academy_student_profiles` is the persistent internal identity of a student inside one academy. Its account link (`user_id`) is written only by enrollment; its manual suspension (`access_suspended_at`, with `access_suspension_revision`) only by `set_student_access_suspension` (see [Online access suspension](#online-access-suspension)), never by record maintenance. `list_student_records` returns per row `online_account` (not_connected, connected or suspended; archival or manual suspension suspends a linked account, mirroring `edra_private.student_access_suspended`), plus explicit `manually_suspended` and `suspension_revision`; `onlineAccountState` in `validation.ts` is the shared mapping. The table's name cell shows a small dot after the name for linked records (destructive red when suspended) with a 1.5 s delayed tooltip, "Account linked" or "Online access suspended", in its own tooltip provider; the dot is focusable with the same accessible label. Unlinked records get no dot; an unlinked, manually suspended record gets a distinct red "unavailable" mark with the "Online access suspended" label instead, so it never reads as linked. Neither shows presence or adds actions.
- `annual_student_records` holds one record per profile per academic year: name, student phone, parent phone, level, track, optional primary group, participation type (`in_person` or `online_only`), archive state, and a `version` incremented by every write.
- Creating a record inserts the profile and the annual record in one transaction.

## Current record validation

These describe source behavior. The product reference owns intended changes. Head Admins have the Owner/Admin permissions below; a suspended member has none in that academy.

- **Groups are optional.** A record may be unassigned (`primary_group_id` is null). A placed group must be active, in the same academy and year, and be in the record's level; it is either level-wide (`track_id` null, any track or none) or has the record's track.
- **Both phones are required and must be valid Egyptian mobiles** for every staff role. There is no empty-phone or validation-bypass path. Phones are stored as canonical `+201XXXXXXXXX`; neither requires OTP verification here.
- The student phone is unique per academy and year, **including archived records**. Duplicate names and shared parent phones are allowed.
- A track is required only when the chosen level has tracks. No synthetic "General" track exists.
- Group capacity is not enforced by current staff placement. Intended booking capacity and manager over-capacity behavior are defined in the product reference.

## Permissions

| Operation | Owner/Head Admin/Admin | Instructor |
|---|---|---|
| Read records and contacts | Allowed | Allowed |
| Create a validated record (including placement) | Allowed | Allowed |
| Edit name and phones | Allowed | Allowed |
| Change level, track, group, or student type | Allowed | Denied |
| Archive/restore, single or bulk | Allowed | Denied |
| Import students (CSV, JSON, Excel) | Allowed | Denied |
| Change or remove groups in bulk | Allowed | Denied |
| Select records; apply or remove existing labels, single or bulk | Allowed | Allowed |
| Create, rename, recolor or delete label definitions | Allowed | Denied |
| Suspend/restore online access, single or bulk, including unconnected, archived and closed-year records | Allowed | Denied |
| See suspension state and the latest manual change, including its reason | Allowed | Allowed |

Authenticated users can only `select` the tables (through RLS). Every write goes through the RPCs `create_student_record`, `update_student_record`, `set_student_records_archived`, `set_student_records_group`, `set_student_records_label`, `set_student_access_suspension`, and the import RPCs below, which check membership and role. `list_student_records` runs with the caller's permissions.

## Contracts

- Web commands (`actions.ts`, `imports/actions.ts`) return `{ ok: true, data }` or `{ ok: false, code, message, fieldErrors? }` with codes `validation`, `forbidden`, `duplicate_student_phone`, `invalid_placement`, `stale_record`, `archived_record`, `year_unavailable`, `not_found`, `unavailable`, `incompatible_selection`, `import_state`, `stale_revision`, `stage_conflict`, `incomplete_staging`, `outcome_changed`, and `stale_suspension`.
- Updates and archive/restore send the version the caller last saw; a changed record returns `stale_record` and nothing is written. Batches are all-or-nothing.
- Reads: `GET /api/students` (list parameters in the query string, see `list-params.ts`) and `GET /api/students/[id]`, both scoped by `academy` and checked against membership. Import reads live under `GET /api/students/imports` (the caller's unfinished import), `/imports/[id]` (summary and counts), `/imports/[id]/rows` (paginated rows); they require an owner or admin.
- Table layout preferences live in localStorage under `edra.students.table.v1:<user>:<academy>`; no student data is stored.
- Search stays in the search input, separate from filter chips; clearing the filter chips preserves the search. Search matches names, phones, levels, tracks, groups, and current student codes only while the academy's student codes setting is enabled. Saved codes are excluded while disabled, and retired codes never match.

## Bulk group changes

`Change group` in the selection bar opens a compact modal that reads the selected records fresh (`previewStudentGroupChange`); the selection itself only holds versions. `set_student_records_group` takes up to 500 records with their versions and either one destination group or `null` (Unassigned). It locks the records in id order and the destination group, and rejects the whole selection if any record is missing, stale, archived, or (for a group) outside the group's level, or outside its track when the group is track-specific. Only `primary_group_id` changes; records already in the target are reported as unchanged. Removing a group may span programs. Capacity is not checked.

## Online access suspension

Manual suspension (EDRA-277) belongs to the academy profile, so it applies across all of a student's annual records and survives account connection. It is independent of archival: archiving or restoring a record never touches it, and restoring it never clears archival suspension. Enforcement is unchanged (`edra_private.student_access_suspended`, `student_caller_record`, `learning_student` and the services built on them, including coupon redemption). Already issued media authorization is not revoked early.

- Schema (`20261104100000_student_access_suspension.sql`): `academy_student_profiles.access_suspension_revision` (starts at 0, separate from annual-record `version`) and append-only `student_access_suspension_events` (academy, profile, revision, `suspended`/`restored`, actor, timestamp, optional reason of at most 500 trimmed characters). Suspensions that predate the migration stay suspended at revision 0 with no event; none is fabricated. Staff of the academy read events through RLS; students, parents, anon and other academies read nothing. Clients cannot write profiles or events; an update trigger keeps events append-only.
- Read: `preview_student_access_suspension(academy, record_ids)` (managers, at most 500 IDs, deduplicated; any year or archive state; missing IDs are omitted) gives each record's profile, name, archived/closed-year state, connection, suspension and revision. `get_student_access_suspension(academy, record)` (any staff member) gives the record's state and its profile's latest change with the actor's name; `GET /api/students/[id]` returns it as `manuallySuspended`, `suspensionRevision` and `latestSuspensionChange`. A failed or malformed suspension read fails the detail read (500) instead of showing an unsuspended student.
- Write: `previewStudentSuspension` and `setStudentSuspension` (`suspension.ts`, server functions over `suspension.server.ts`) over `set_student_access_suspension(academy, [{id, revision}], suspended, reason)`. One desired-state command serves a row, the details page and a selection. It derives the actor from the session, rechecks live manager authority, takes at most 500 record IDs (repeats collapse; one ID with two revisions is `validation`), resolves and deduplicates profiles server-side, and rejects the whole call when any record is missing or belongs to another academy (`not_found`). Profiles already in the desired state are `unchanged`: their revision, timestamp, latest event and reason stay as they were. Every profile that needs a change must still be at the expected revision; otherwise nothing changes (`stale_suspension`), so a delayed retry cannot undo a newer opposing action. Each actual change increments the revision and appends one event with the same timestamp as the state. The result lists changed and unchanged records with their profile's revision. Annual records, versions, placement, history, account links, grants and usage are untouched; closed years stay closed.
- Lock order: annual records `FOR KEY SHARE` in ID order, then profiles `FOR UPDATE` in ID order. Enrollment links lock the matched record `FOR SHARE` before updating the profile, and archive/restore lock records `FOR UPDATE` without touching profiles, so record locks always precede profile locks.
- Filter: the `access` URL/API parameter is `suspended` (manual suspension, connected or not; archival alone does not match) or `has_access` (connected, not manually suspended, listed record not archived); anything else is `400` from the API and dropped from a hand-edited page URL. The toolbar's Online access choice is All / Suspended / Has Access. It is applied in `list_student_records` (`p_access`, default null so older callers keep working; the old signature was dropped to avoid an ambiguous overload) before counting and paging, ANDed with every other filter; `yearTotal` is unchanged. Has Access does not promise access to particular content.
- UI: managers get Suspend/Restore online access in each row's menu (the same items on right-click), in the selection bar (shown when the selection, as last seen, has students to suspend or restore), and beside the labels on the student page, which also shows the current causes (Online access suspended, Suspended by archival) and the latest change with its time, actor and reason. Instructors see the state but no action. All entry points open one confirmation (`components/suspension-dialog.tsx`) that loads the fresh preview first, shows how many will change, how many are unchanged and how many stay suspended by archival, and takes one optional reason. On `stale_suspension` it keeps the reason, reloads the review and waits for a new confirmation. A bulk success clears the selection and returns focus to the page checkbox; a failure keeps it. The selection and an open dialog reset when identity, year, search or any filter changes.
- Cache: after acknowledgment, the dialog invalidates `["students", academy]` (lists and details of every annual record), `["learning"]` and `["content-access"]`. The editor's query key does not include suspension, so an open draft is not remounted. If a student read on screen fails to refresh, the toast keeps the acknowledged outcome and offers Refresh, which repeats only the refresh. Late answers after an academy change are ignored.

SQL coverage: `supabase/tests/student_suspension.sql` and the SU1–SU5 races in `supabase/tests/concurrency.sh`. A full suspension history view is not implemented; earlier events are retained.

## Labels

Labels belong to the annual record (`annual_student_record_labels`), never to `academy_student_profiles`, so a new year's record starts unlabeled and the academy-wide `students` catalog is reused without copying associations. They are staff-only metadata: writes never change the record, its version, placement, access or history, and need no expected version. Archived and closed-year records take labels without relaxing any record-editing guard.

- Write: `setStudentRecordsLabel` (`labels.ts`, a server function over `labels.server.ts`) and `set_student_records_label(academy, record_ids, label_id, applied)`, used for one record and for a selection. It sets one label's desired state on up to 500 explicit records (`label-limits.ts`; duplicates collapse) and returns how many associations changed. Other labels are never replaced, a repeat changes nothing, and one record that is missing or in another academy rejects the whole call (`not_found`). It takes a share lock on the label, so deletion and assignment serialize, then locks records and associations in id order. `delete_label` counts these uses across every year and archive state.
- Read: list rows and `GET /api/students/[id]` return `labelIds`; names and colors come from one `useLabels(academyId, "students")` catalog, so a rename or recolor needs no record refetch. Direct record reads have no year or archive restriction, so historical records show labels; the list still targets the open year, and there is no history browser.
- Filter: the `labels` URL/API parameter holds comma-separated IDs (at most 100, any of them matches, canonical order) or `none` for Unlabeled, an exclusive value. Anything else is `400` from the API and dropped from a hand-edited page URL. `list_student_records` filters before counting and paging; `total` is the matching count and `yearTotal` is unchanged. A selected label that was deleted stays as an "Unknown label" chip and matches nothing until removed, so the results never widen silently.
- Table and page: labels beside the name in the Name column, a Labels submenu in each row's menu (the same actions on right-click or the Menu key and from the Actions button), a Labels control beside the student page's identity, and the catalog's `LabelManager` for managers.
- Bulk: the selection bar's Labels menu has explicit Apply label and Remove label lists for all staff; Instructors get no other bulk action. It targets the explicit selection only, shows the change after the server accepts it, clears the selection on success and keeps it on failure. "Select page" covers loaded rows only, and there is no "select every matching student". The selection clears when identity, year, search or any filter changes.
- Cache (`use-labels.ts`): a single-record change shows at once and undoes only that label on failure. One record and label pair never has two writes in flight, and lists and details refresh when the last write answers. A confirmed label deletion refreshes them too; a rename or recolor does not. Results reach the UI only while the same academy is active.

SQL coverage: `supabase/tests/labels.sql` and the LB4–LB7 races in `supabase/tests/concurrency.sh`.

## Importing

The Import menu on the students page opens a dialog for CSV, JSON, or Excel, with instructions and templates. Choosing a file opens `/<academySlug>/students/import?format=csv|json|xlsx` with a read-only entries table, search, and selection for deleting draft entries. Headers and columns are matched automatically. Mapping warnings open a sheet showing unmatched fields; matched fields and defaults stay tucked away. Fully matched files are staged automatically for server validation and confirmation. The selected file passes in memory, scoped to the academy; reloading before staging returns to the students list to choose it again.

Code lives in `imports/`: `parsers/` (CSV with Papa Parse, JSON, XLSX with ExcelJS after an fflate expansion check) run in a Web Worker (`worker.ts`, `parse.ts`) with a 30-second timeout; `mapping.ts` suggests columns from English/Arabic header aliases and builds staged rows; `templates.ts` builds the templates.

CSV, JSON, and Excel templates include an example for every academy level/track, using a compatible active group when available, plus an unassigned online example. Names are labeled examples and phone numbers are masked (`01XXXXXXXXX`); replace them or delete the example rows before importing. Templates never read student records.

- Limits: 5,000 nonblank data rows, 10 MiB, 100 columns, 2,000 characters per mapped cell, 50 MiB expanded XLSX.
- Imports only create records. A student phone already used this year (active or archived) is skipped; rows sharing a phone within the file are all blocked until corrected or excluded.
- `student_import_sessions` and `student_import_rows` hold a session's staged rows. States: `staging → reviewing → importing → completed`, with `cancelled` (unconfirmed drafts) and `blocked` (the year closed mid-import).
- Rows are staged in requests of at most 100 rows and 256 KiB (`stage_student_import_rows`, idempotent per ordinal). `finalize_student_import` resolves every row in the database: level by code or exact normalized name, track within the level, group within the level, track, and year; explicit values win over session defaults, which apply only where compatible. `Unassigned`/`none` or JSON null is an explicit empty group.
- Corrections (`correct_student_import_row`) and exclusions change only the staged row and require the session's current `revision`.
- `confirm_student_import` revalidates; if records or structure changed the outcome, it saves the refreshed preview and returns `confirmed: false`. Otherwise Ready rows get immutable batches of 100. `process_student_import_batch` creates one batch through `create_student_record`, one subtransaction per row: a concurrent duplicate phone becomes skipped, a placement or validation failure becomes failed, and anything unexpected rolls back the batch so it can be retried. A repeated batch returns its stored outcomes. Batches only run while the page submits them.
- `/<academySlug>/students/imports` lists only completed imports, their original staff member, completion date, and created/skipped/failed counts. Each session has a unique academy-specific number; its heading and breadcrumb use `Review Import #001`. Drafts are retained for review and recovery but do not appear in logs. Completed imports remain readable after the year closes. Only the original importer can resume or change a draft, and only owners/admins can view logs or import.
- `remove_student_import_entries` removes selected draft entries in one revision-checked transaction by excluding them. Removed rows remain in the log; the entries themselves have no editing controls. There is no cleanup schedule.

## Deferred

Updating existing records through imports, general exports, bulk changes other than groups, labels and online access, deletion and custom fields. Public booking lives in `booking/`. Student academy onboarding lives in enrollment.

## Provenance

`created_via` on profiles and annual records is `direct` (staff tools, imports and invite onboarding, attributed to `created_by`) or `booking`. Only `booking` may have a null `created_by` (anonymous public registration). Both columns are immutable. See the [booking module](../booking/README.md).
