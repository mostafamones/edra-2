# Staff student records

Current staff-record implementation at /<academySlug>/students on the staff host. Intended rules are in [students](../../../../docs/product/domains/students.md). This module does not create authentication accounts; academy joining and account linking live in [enrollment](../enrollment/README.md).

## Model

- `academy_student_profiles` is the persistent internal identity of a student inside one academy. Its account link (`user_id`) and independent suspension (`access_suspended_at`) are written only by enrollment and staff suspension management, never by record maintenance. The edit sheet shows whether the record's profile has a connected online account and whether its access is suspended. `list_student_records` returns the same state per row (`online_account`: not_connected, connected or suspended; archival or independent suspension suspends a linked account, mirroring `edra_private.student_access_suspended`), and `onlineAccountState` in `validation.ts` is the shared mapping. The table's name cell shows a small dot after the name for linked records (destructive red when suspended, none when unlinked) with a 1.5 s delayed tooltip, "Account linked" or "Online access suspended", in its own tooltip provider; the dot is focusable with the same accessible label. It shows connection/access state, never presence, and adds no actions.
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

Authenticated users can only `select` the tables (through RLS). Every write goes through the RPCs `create_student_record`, `update_student_record`, `set_student_records_archived`, `set_student_records_group`, and the import RPCs below, which check membership and role. `list_student_records` runs with the caller's permissions.

## Contracts

- Server Actions (`actions.ts`, `imports/actions.ts`) return `{ ok: true, data }` or `{ ok: false, code, message, fieldErrors? }` with codes `validation`, `forbidden`, `duplicate_student_phone`, `invalid_placement`, `stale_record`, `archived_record`, `year_unavailable`, `not_found`, `unavailable`, `incompatible_selection`, `import_state`, `stale_revision`, `stage_conflict`, `incomplete_staging`, and `outcome_changed`.
- Updates and archive/restore send the version the caller last saw; a changed record returns `stale_record` and nothing is written. Batches are all-or-nothing.
- Reads: `GET /api/students` (list parameters in the query string, see `list-params.ts`) and `GET /api/students/[id]`, both scoped by `academy` and checked against membership. Import reads live under `GET /api/students/imports` (the caller's unfinished import), `/imports/[id]` (summary and counts), `/imports/[id]/rows` (paginated rows); they require an owner or admin.
- Table layout preferences live in localStorage under `edra.students.table.v1:<user>:<academy>`; no student data is stored.
- Search stays in the search input, separate from filter chips; clearing the filter chips preserves the search. Search matches names, phones, levels, tracks, groups, and current student codes only while the academy's student codes setting is enabled. Saved codes are excluded while disabled, and retired codes never match.

## Bulk group changes

`Change group` in the selection bar opens a sheet that reads the selected records fresh (`previewStudentGroupChange`); the selection itself only holds versions. `set_student_records_group` takes up to 500 records with their versions and either one destination group or `null` (Unassigned). It locks the records in id order and the destination group, and rejects the whole selection if any record is missing, stale, archived, or (for a group) outside the group's level, or outside its track when the group is track-specific. Only `primary_group_id` changes; records already in the target are reported as unchanged. Removing a group may span programs. Capacity is not checked.

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

Updating existing records through imports, general exports, bulk changes other than groups, deletion, booking and custom fields. Student academy onboarding lives in enrollment.

## Intended behavior awaiting implementation

Current placement SQL compares group and student tracks exactly; the approved product allows level-wide groups to accept any track at that level. Track-removal broadening requires its own implementation. Do not broaden permissions or change historical placement merely to match this reference.
