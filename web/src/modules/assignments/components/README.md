# Assignment components

Components are grouped by the staff workflow they serve. Import components directly from their files.

- `list/`: assignment browsing, search, filters, and cards. `page.tsx` is the list route entry.
- `editor/`: create/edit route entries, the form wiring, due date, audience count and review. The step flow, autosave, audience picker, parts list and review layout are shared with quizzes and exams in `src/components/shared/assessment/`. `parts/` holds the assignment configuration of the shared part editor (types, images, the legacy part, JSON import).
- `workspace/`: assignment detail wiring on the shared workspace (`src/components/shared/assessment/workspace/`) and lifecycle actions. `overview/` owns the statistics, the marks chart and the parts; `students/` supplies the columns, filters and graph-selected mark filters to the shared students table. `page.tsx` is the detail route entry.
- `marking/`: how an assignment's parts and marks map onto the shared marking sheet and how a save is sent. The sheet, form and per-part entry are shared with quizzes and exams.
- `shared/`: assignment-specific labels used across workflows.

The shared marks query and cache-update hook lives in `../hooks/use-marks.ts`. Domain rules, types, queries, and server operations remain at the module root.
