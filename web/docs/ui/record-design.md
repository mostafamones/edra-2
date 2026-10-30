# Design records around the admin's next task

The owner approved [Figma direction D](https://www.figma.com/design/e4dOmb3pPm5IflpjeTFNiI?node-id=2012-495) on 2026-10-30, replacing C's unfinished-unit cards with the Attendance/Session detail family. Keep compact icon-backed facts, section header/action bars, aligned unit records and inline progress. The file contains mobile and in-person variants. It is a composition reference with example data, not a permission contract or source of student facts.

The student record's frequent tasks are identifying/contacting the student or parent, editing enrollment through the existing editor, and checking access and work. Preserve one compact identity/contact header and one clear Edit student action. Show account connection alongside contacts. In-person group placement and attendance matter; omit both for online-only students.

## Lessons from the rejected layouts

- Equal widths alone do not establish good composition. The owner rejected the three-column contact/enrollment/account card followed by another three-column statistics strip: repeated subdivisions, duplicated placement facts and excess height made it bland.
- Avoid separate record and learning columns with unrelated heights. Do not hide this with arbitrary minimum heights.
- Borrow the assessment workspace's density, meaningful visuals and contextual actions, rather than copying its statistics strip into every feature.
- Record details was an ambiguous duplicate of basic record information and editing. Do not introduce it again without a distinct task.
- Analytics support the record. Do not lead with large charts or replace named results with anonymous bars.

## Approved composition

Use full-width sections and the existing Edra spacing, Figtree/Poppins, shadcn primitives and Hugeicons. Reuse source icon components. A compact attention row appears only for an observed obstacle, such as expired access with unfinished tracked items or recorded recent absences. No inferred risk, motivation, causes, predictions or all-clear statements from missing data.

All unit states use aligned records, stacking on mobile, and preserve separate access and completion status. A View progress disclosure groups named explanation videos and assessment submissions in context. Use a single labeled completion summary rather than another statistics strip. A loaded page can provide local prioritization, not an academy-wide ranking. Keep larger catalogs available through expansion and pagination.

Assessments pair a named latest announced result with up to four chronological announced results of the same assessment type. Show percentages against each snapshot's maximum; distinguish previous/latest rather than claiming improved ability. Submitted work awaiting or needing marking stays separate. Private marks never enter announced charts, and missing work is never a zero. Keep full records available in context.

## Evidence and data boundaries

Read public domain APIs through academy/record/year-scoped query options. Reuse the first-page result in previews and expanded views; do not refetch for expansion or a local assessment-type selection. Later history pages must not change the initial summary's scope. A paginated sample is not complete history; disclose its boundary when relevant.

Review actual online and in-person records, both ends of the page, narrow widths, long titles, sparse data, independent failures, keyboard disclosure/focus, and the existing editor. Tests must cover calculation/selection semantics and real query reuse, rather than class names. Passing a build does not establish usability.

## Research and adaptation

- [GOV.UK summary lists](https://design-system.service.gov.uk/components/summary-list/) support scannable related facts and contextual actions. Adapt their semantics to the task, not a default boxed layout.
- [Nielsen Norman Group progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) supports visible frequent facts and secondary detail in context.
- [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) provides critique guidance; Edra's owner rules and approved reference remain authoritative.
