# Student details

## Approved direction

The owner approved the refined [session-style Figma direction D](https://www.figma.com/design/e4dOmb3pPm5IflpjeTFNiI?node-id=2012-495) for implementation on 2026-10-30. It supersedes C's unfinished-unit cards. The file includes online/in-person records, mobile, an expanded learning example, and independent empty/error states. Examples illustrate composition, not student facts or new permissions.

Use four compact session-style facts, clear section headers with contextual actions, and a full-width units workspace. Units have independent access and completion columns, local search/status filters, and inline progress disclosure. In-person records include official attendance; online-only records omit groups and attendance. Assessments retain the named announced result, bounded same-type chart and work needing marking.

## Confirmed product rules

- Staff open a dedicated student page while retaining quick edit. Returning to the list preserves its filters.
- Reads belong to the selected academy and annual record; do not silently combine academies or years. Archive, closed-year and existing editor permissions remain authoritative.
- Owners, Head Admins, Admins and Instructors were explicitly authorized to read the selected academy/year's student access/progress and private/announced assessment summaries. Read-only projections were applied to the development database. This does not broaden grant, editing or marking permissions.
- Mandatory attendance rate is (Present + Late) / (Present + Late + Absent), using finalized official values, excluding archived sessions. Excused and Unknown remain separate and excluded from the denominator. No denominator means no rate.
- Learning completion uses existing tracked-video coverage and assessment-submission semantics. Documents and answer videos are not completion requirements. Completion and access remain independent.
- Access commands must reuse existing grant/extend/revoke conditions. Prerequisites are not bypassed. Staff do not redeem student coupons or connect accounts manually.

## Current implementation boundaries

The staff learning projection returns 24 currently published placement-eligible units per page, plus catalog totals. It is not a complete historical catalog of out-of-placement, removed or unpublished content. Preview ranking and expired-work attention use the first loaded page only, and no all-clear is inferred if nothing matches. Search and access filters cover the loaded page only, with that boundary shown for larger catalogs. Small catalogs show all loaded units; larger catalogs retain a preview and View all. Expansion reuses that page; later pages load on demand.

Assessment candidates are paginated by creation date. The summary shows up to four announced results of one type within the first page, ordered by announcement time. When candidates exceed the page, its scope is labeled. Paging expanded records does not replace the initial summary. Latest/previous comparison is descriptive, not a combined weighted score or prediction. Private marks, incomplete marking, announced snapshots and pending corrections remain distinct. Review work links to the existing assessment workspace, where current marking permissions are checked.

Initial learning and attendance reads are shared by the attention row and their sections. Assessment preview is visible, so its initial read is intentional; expanding its records or switching chart type adds no read. Existing domain invalidation roots remain unchanged. Learning keys additionally include the saved year/grade/track/participation/archive/account scope, so editing placement resets paging and revalidates eligibility without invalidating other students. Identity transitions retain the application's scoped cache cleanup and reset the record subtree.

The existing student editor remains authoritative. Open unit and Review access link to the existing staff unit workspace. View progress expands named videos and assessment submissions in place. Published material labels load on demand through the content module, using the exact published revision under existing staff RLS, without drafts or media URLs. The content/academy/unit-scoped cache is reused for one minute and participates in existing content invalidation. Progress retains its student/placement scope. If publication changes item identities, the disclosure reports the mismatch rather than inventing labels. Direct access commands on this page, precise unmet-prerequisite reasons, complete out-of-placement history and a dedicated annual-record switcher are not implemented by this layout change.

## Verification

The earlier C iteration had live visual coverage; that does not verify D. For this revision, focused tests cover cached expansion/paging, placement changes, local search and no-results recovery, named material disclosure, and completion after expiry. Loader tests verify academy/unit/exact-publication scoping and stopping after a denied unit read. Mocked query tests do not establish live RLS behavior.

Fifteen focused tests pass. Final production webpack build, TypeScript and lint pass; the full lint run retains five unrelated existing warnings. The build uses the existing EDRA_E2E output directory to isolate it from the owner’s running development app. No application server was started or restarted.

Live review in the owner’s running Edge app covered Nour’s online record, Ali’s in-person record with 89% mandatory attendance, real named video/submission progress, search/no-results recovery, keyboard disclosure, and opening/cancelling the existing editor without saving. Desktop and 390px views had no document overflow; mobile facts were refined to two columns. An empty online record was also inspected. Additional roles, light theme, synthetic network failures and cross-academy RLS behavior were not verified in this visual pass. No database values, schema or permissions were changed.
