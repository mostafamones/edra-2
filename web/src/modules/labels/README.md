# Labels

Shared, staff-only academy labels. Product rules: [Labels](../../../docs/product/domains/labels.md). Each academy has one catalog, independent of academic years and of the modules that use it. This module owns label validation, permissions, the catalog read, definition commands and the reusable label UI. Each consuming module owns its own assignment integration; assessments (assignments, quizzes and exams) are the first (see `src/modules/assessments/README.md`).

## Data

Migration `20261029190000_labels.sql`:

- `labels` (`id`, `academy_id`, `name`, `color`): names are trimmed, 1–40 characters without control characters, unique per academy case-insensitively (`labels_academy_name_key`). `color` stores only a key of the central palette (`labels_color_check` allowlist; `src/lib/palette.test.ts` keeps it equal to `PALETTE_KEYS`).
- Supported targets have their own association tables with real composite foreign keys to `(academy_id, id)` on both the record and the label, so links cannot dangle or cross academies, and a primary key per record and label prevents duplicates: `assignment_labels`, `quiz_labels`, `exam_labels`. Deleting a label cascades to its associations; the records are never touched.
- RLS: `select` for `is_academy_member` (active, unsuspended staff with an allowed session) only. Students, parents, other academies and anonymous callers read nothing. No table write grants: writes go only through the commands below.

Commands (security definer; each re-checks live membership, suspension and role through `academy_role_for` and raises `P0001` codes):

- `create_label(academy, label_id, name, color)` — managers (Owner, Head Admin, Admin). The caller chooses the ID, so a retry returns the same label. `duplicate_name`, `validation`, `forbidden`.
- `update_label(academy, label_id, name, color)` — managers; sets the desired name and color, updating every use, including archived and closed-year ones. `not_found`, `duplicate_name`.
- `delete_label(academy, label_id, confirmed)` — managers. Locks the label `for update`, counts uses across every target, type, year and state, and returns `{"status":"confirm","uses":n}` without changes when the label is used and `confirmed` is false; otherwise deletes the label and every association in one statement (`{"status":"deleted"}`). Deleting an already deleted label succeeds, so retries are safe.
- Target commands (such as `set_assessment_label`) take a share lock on the label, so deletion and assignment serialize: a label that gains a use while a deletion runs is reported as used rather than removed without confirmation.

## Code

- `actions.ts`: `createLabel`, `updateLabel`, `deleteLabel` server actions (zod-validated; run as the cookie session through `server.ts`).
- `server.ts`: `runLabelCommand` and `labelFailure` for consuming modules' trusted label commands.
- `queries.ts`: `labelsQueryKey(academyId)`, `loadLabels`, `useLabels` (browser read under RLS, sorted by name).
- `permissions.ts`: `canManageLabels(role)`, a UI hint mirroring the database.
- `validation.ts`: name/color schemas and `labelSchema` (an unknown stored key shows as gray instead of failing a page).
- `components/`: `LabelBadge`/`LabelBadges`/`LabelSwatch` (palette colors plus the written name), `LabelColorPicker` (named radio entries), `LabelEditor` (create, rename on Enter/blur with Escape to revert, recolor, delete with the conditional confirmation dialog), `LabelManager` (label icon button and editor popover; a consumer may open it from another element, which anchors it and receives focus back), `LabelsSubmenu` (context-menu checkboxes expressing the desired state, plus Manage labels for managers) and `LabelFilter` (any of several labels, or Unlabeled as an exclusive alternative).

Every academy starts with three editable labels (Online only, Ready for in-person, Needs review), added by a database trigger when the academy is created.

Definition changes refresh the catalog and call the consumer's `onChanged` so it refreshes its own caches. UI results are applied only while the same academy is active (`useAcademyScope`).

SQL coverage: `supabase/tests/labels.sql` and the LB1–LB3 races in `supabase/tests/concurrency.sh`.
