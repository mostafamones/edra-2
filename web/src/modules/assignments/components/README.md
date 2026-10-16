# Assignment components

Components are grouped by the staff workflow they serve. Import components directly from their files.

- `list/`: assignment browsing, search, filters, and cards. `page.tsx` is the list route entry.
- `editor/`: create/edit route entries, the form wiring, due date, audience count and review. The step flow, autosave, audience picker, parts list and review layout are shared with quizzes and exams in `src/components/shared/assessment/`. `parts/` owns part and question authoring; `images/` owns the inline question-image editor and viewer.
- `workspace/`: assignment detail composition and lifecycle actions. `overview/` owns statistics, the chart, and top students; `students/` owns the recipient table and graph-selected mark filters. `page.tsx` is the detail route entry.
- `marking/`: the general marking sheet, individual student sheet, marks form, and per-part answer entry. Both the workspace and students view use these components.
- `shared/`: assignment-specific labels and the not-found state used across workflows.

The shared marks query and cache-update hook lives in `../hooks/use-marks.ts`. Domain rules, types, queries, and server operations remain at the module root.
