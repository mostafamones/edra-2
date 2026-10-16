# Assessment form

The create/edit form shared by assignments, quizzes and exams. Change it here to change all three.

- `shell.tsx`: the flow: Basics, Parts and Review steps, one part edited on its own page, automatic saving until work starts, the pinned footer, and error and conflict handling. Modules pass fields, validation and a `commit` function.
- `load.tsx`, `edit.tsx`, `page.tsx`: loading the year, levels and groups; loading the entity to edit; the page frame and discard dialog.
- `basics.tsx`, `audience.tsx`, `solutions.tsx`: the Basics step and its sections.
- `parts-list.tsx`, `review.tsx`, `part-frame.tsx`: the Parts step cards, the Review step layout, and the page one part is edited on.
- `sheet/`: the Question Sheet / Written Work part and question editors that quizzes and exams share.
- `draft-form.ts`: builds the resolver and the quiet autosave check from a module's field checks and draft schema.

A module keeps what is its own: field values and validation, labels, the audience count query, and (assignments) the part editor with images.
