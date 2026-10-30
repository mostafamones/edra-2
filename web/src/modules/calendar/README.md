# Staff Calendar

The Calendar route composes existing staff-authorized schedule, session and assessment reads. It adds no database permissions or tables. Week starts Monday as in the reviewed Figma proposal; all displayed times and occurrence dates use Africa/Cairo, independent of the browser timezone.

Recurring plans are projected only within the open year's date boundaries. A recorded session replaces that schedule's planned occurrences on the date it actually started, preserving actual times and snapshot audience. Unrecorded past occurrences remain labelled Planned in their popovers. Archived session history is excluded. Calendar is not an attendance report.

Assignment due dates appear above the grid. Quiz/exam availability longer than six hours appears as an assessment window in that strip, with exact original opening/closing timestamps in its popover. Shorter windows occupy the grid; cross-midnight intervals split by Cairo date. Draft/preparing and ready assessments are excluded. Missing closing times say Opens rather than inventing an end time.

Schedules, structure and group labels reuse existing query keys. Live and history queries retain the existing infinite-page shape and load remaining pages explicitly. History includes the preceding day for overnight sessions. Assessments use the existing authorized paginated list RPC, read to completion once per academy/year and cached under the assessments root so existing assessment mutations invalidate them. Local view/type/audience filters issue no new reads. A catalog failure never becomes a successful empty state; a failed source is named and retryable while other available data remains visible.

Desktop Week and Agenda and mobile daily agenda share the same event projection. Event popovers use existing shadcn Popover; filters use FilterPopover. Starts reuse the public useStartSession hook, including idempotency, scope guards and existing server authorization. Today-only planned starts are deliberate actions inside event details. Creation and assessment/attendance links use existing canonical routes. This screen does not add drag-rescheduling or create a second editor.

Verification: projection and pagination/cache tests run with Vitest. The page is visually compared with Figma Calendar B using the owner's running app; it is not a newly approved screenshot baseline. No database migration or cloud fixtures are needed.
