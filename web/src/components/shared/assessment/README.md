# Assessment form

The create/edit form shared by assignments, quizzes and exams. Change it here to change all three.

- `shell.tsx`: the flow: Basics, Parts and Review steps, one part edited on its own page, automatic saving until work starts, the pinned footer, and error and conflict handling. Modules pass fields, validation and a `commit` function.
- `load.tsx`, `edit.tsx`, `page.tsx`: loading the year, levels and groups; loading the entity to edit; the page frame and discard dialog.
- `basics.tsx`, `audience.tsx`: the Basics step and the audience picker.
- `parts-list.tsx`, `review.tsx`, `part-frame.tsx`: the Parts step cards, the Review step layout, and the page one part is edited on.
- `sheet/`: what quizzes and exams share on top of the part editor: the Question Sheet / Written Work types, readiness rules and the editor configuration.
- `draft-form.ts`: builds the resolver and the quiet autosave check from a module's field checks and draft schema.

A module keeps what is its own: field values and validation, labels and the audience count query.

# Assessment workspace and marking

The detail page and the marking sheet are shared the same way.

- `workspace/`: `page.tsx` loads the assessment and shows the loading, error and not-found states. `view.tsx` is the page itself: header (title, badge, facts, actions), the read-only and setup notices, and the Overview and Students tabs. `stats.tsx`, `parts.tsx`, `top.tsx` and `distribution.tsx` are the overview cards. `students.tsx` is the whole Students tab (search, filters, sorting, paging, announcing selected results); a type supplies the columns, the status filters and how announcing is run. `names.ts` describes an audience.
- `marking/`: the marking sheet. `sheet.tsx` finds a student by name or code and goes on to the next after a save; `student.tsx` opens one student from the list; `form.tsx` and `part.tsx` enter marks question by question (letters for choice questions, a mark for manual ones, keyboard driven), with fast part totals and excused adjustments where a type enables them. `draft.ts` holds the entry rules.

A type maps its own parts and a student's work onto `marking/types.ts` and says how a save is sent (assignments send marks and answers in one command; quizzes and exams record physical work, then marks). Locked questions, notes under a question, and a confirmation before saving are slots, not forks.

# Part editor

`parts/` is the page one part is edited on, for every type. `editor.tsx` holds the type switcher, the question count with undo (Cmd/Ctrl+Z) and what is set aside when the type or count changes; `questions.tsx` lays the questions out as the type says: `pager.tsx` (one question at a time, numbered jumps), numbered rows with letter boxes, or `ranges.tsx` (marks shared by a range of entries). A type passes a `PartsConfig` (`parts/config.ts`): its part types and layouts, choice and question limits, blank questions, the text field (every type uses `images/field.tsx`, which takes pasted images). Quizzes and exams build theirs with `sheet/config.tsx`.

# Question images

`images/` holds pasted question images for every type: `tokens.ts` (the `{{image:<id>}}` token, the 10-per-question cap), `context.tsx` (uploads and signed URLs; wrap a form or page in `ImagesProvider`), `field.tsx` (the editable field), `text.tsx` (stored text shown read-only) and the badge, frame and viewer. Files live in the private `assignment-images` bucket under `<academy_id>/<image_id>`; the database checks references and the cap for assignment, quiz and exam questions (migrations `20261007140000` and `20261017120000`).
