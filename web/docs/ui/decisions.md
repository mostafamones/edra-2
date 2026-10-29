# Design decisions before components

Use this with the assigned product contract. These are Edra implementation defaults, not permission to invent features, metrics, roles or workflows. External reasoning is in [research](research.md); concrete local examples are in [references](references.md).

## Start with the job

Write one sentence: **[actor] needs to [outcome] in [context].** Then outline the shortest complete path, including returning to work after success or failure. A list of widgets is not a task definition.

Before coding a new page, compare two plausible compositions in a few lines. Choose the one that makes the frequent task easier with fewer unrelated decisions. Do this in task notes, not in product helper text. A small change within a proven pattern needs only its relevant difference, not a design essay.

## Choose the surface

| User need | Default | Avoid |
| --- | --- | --- |
| Compare many records by shared facts | Existing staff table/list family with aligned fields | Cards that hide the facts needed for comparison |
| Recognize learning content visually | Existing student course cards/list preference | Forcing staff density or treating a loaded page as the catalog |
| Inspect or change a few properties while preserving place | Existing floating sheet and quick-edit family | Duplicating the complete authoring workspace |
| Author complex content or complete a long task | Dedicated workspace with domain save rules | A large nested dialog or a sequence of unnecessary confirmations |
| Choose a filter or local presentation setting | Existing popover/selector | Navigating away or saving remote preferences on every click |
| Execute a short command | Searchable choices, contextual next step, explicit final action | Making the user traverse a long list with arrows or executing on selection when review is needed |
| Understand today's work | Prioritized actionable information, then supporting context | Shortcut tiles and arbitrary statistics as a substitute for an overview |

These are defaults, not universal prohibitions. State a task-specific reason when deviating.

## Establish hierarchy

1. Put identity and scope where the user expects them in the existing shell. Avoid repeating the same title, academy and actions at several levels.
2. Give the current task a clear primary action when one exists. Read-only pages do not need an invented primary button. Use the reference family's header slot and action placement.
3. Prioritize information by what changes the user's next action. Reduce decorative containers before reducing essential context. A card should group a meaningful object/task, not wrap every label.
4. Use existing type, spacing, surface, border and palette conventions. Preserve consistent alignment within a family. Do not introduce a new token scale, arbitrary accent colors or a dashboard aesthetic for one page.
5. Keep secondary controls available without competing with the primary task. Disclosure is for infrequent choices, not required actions hidden behind hover, double-click or right-click.

## Decide interaction explicitly

- **Navigate or act:** links navigate; buttons perform commands. Never nest controls inside a whole-row link. Make click targets and keyboard semantics agree.
- **Hidden or disabled:** omit actions the role can never perform when disclosure would serve no purpose. For a relevant temporary restriction, show a truthful status and available next step. Do not leave an apparently usable link that predictably returns 404. This does not change server disclosure/security rules.
- **Defaults:** use an approved domain default or an applicable remembered preference. Do not infer financially or academically consequential choices from convenience. Suggestions remain suggestions unless the product contract says otherwise.
- **Search:** name the searchable scope; typing stays immediate. Remote results follow the established debounce and paging contract. Expose active filters and a reversible reset. Distinguish no records from no matches.
- **Editing:** retain dirty input across tabs and read failures. One deliberate save commits the reviewed change according to the domain. Distinguish write failure from a refresh failure after a successful write.
- **Feedback:** validation belongs to fields; service failures belong to the affected region; authentication uses the auth flow. Do not turn a permission or database failure into “Check the fields.” A retry must be capable of changing the outcome.
- **Motion:** communicate entry, continuity or state changes. Do not add motion simply to make the screen feel polished. Check reduced-motion behavior and avoid animated layout shifts while interacting.
- **Copy:** concise domain names and action verbs. No unsolicited subtitles, helper text, tooltip explanations or invented backend terminology. Required errors/status/accessible names remain available.

## Design realistic constraints

Evaluate empty, typical and crowded data, not only three neatly sized fixture records. Check long Arabic/English names, mixed-direction identifiers, missing optional metadata, timezone-sensitive dates and the longest action label. Preserve the existing academy-time and palette contracts.

At narrow widths prioritize the same task; do not simply shrink the desktop layout. Check open menus/sheets and the actual shell, not just the page body. Inspect at 360 and 1440 pixels in both themes, and reflow at 320 CSS pixels where applicable. Check focus visibility with sticky regions, keyboard escape/return, browser zoom and reduced motion. Record exactly what was exercised; these samples are not whole-product accessibility certification.

## Reject weak proposals early

| Weak proposal | Better reasoning |
| --- | --- |
| “Use four cards because dashboards have cards” | Identify the decisions those cards enable; remove duplicated navigation if it displaces the real task |
| “Use the same colors as Mones” | Carry forward his flow's context, density, action placement and recovery, using the existing tokens |
| “Add a tooltip to explain this ambiguous selector” | Fix its label/grouping first; helper text requires owner request |
| “The build and axe passed, so UX is done” | Demonstrate a complete task, compare the rendered family, record remaining gaps |
| “Fetch again to be safe” | Name freshness/authority needs, reuse the owning query contract, test the extra read if necessary |
| “Cache everything for speed” | Protect tenant/identity boundaries and authority; preserve domain freshness exceptions |

## Home as a calibration example

The local Home pilot is an engineering example, not a visual gold standard. Its shortcut cards and session history do not by themselves establish an admin's priorities. Before iterating, identify the approved daily tasks and reliable data sources, then justify the information order. A proposed “needs attention” queue is not authorization to implement new workflows or new aggregate reads. This distinction prevents agents from treating their own latest output as an approved reference.

The next local iteration prioritizes live work, places roster expectations beside its audience/location, and reduces navigation to compact secondary links. With no live work, recent sessions lead instead. This state-dependent hierarchy came from inspecting the actual empty academy: reviewing only a populated fixture concealed an unnecessarily dominant empty column. Include realistic absence of activity when deciding the layout, not only when checking error/empty messages.

## Owner-calibrated selection shortcuts

Home's later operational iteration replaces session history and duplicate navigation with a scoped attention queue, today's plan and enrollment distribution. Counts come from explicit aggregate queries; each actionable statistic opens the corresponding filtered list. Treat this as a candidate under review, not an approved visual baseline. Select information by the admin decision it supports before borrowing a list's visual treatment.

For a dense operational page, inspect Schedules/Attendance. For grouped editable preferences, inspect Account settings. For membership actions, inspect Team. For object authoring, inspect the refined content editor. For student discovery, inspect CourseCard. These choices come from the owner's feedback in [references](references.md), not from a generic preference for cards or tables.

The transferable quality is low initial complexity with fast contextual actions. Do not apply inline renaming, autosave, a keyboard bar or a floating panel everywhere merely because they work in the editor. First identify the equivalent task and persistence rules. Use the fewest guide sections and source examples needed for that decision; a small change does not require rereading the whole UI archive.
