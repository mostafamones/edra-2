# Finished interaction references

Reviewed against main `ff8ace9`. Use the finished assessments and learning flows as behavioral references. Their module READMEs describe domain decisions; this guide extracts reusable interaction choices. This does not approve every current screen or change domain permissions.

## Design the task before the screen

State the user's task and shortest complete path. Choose the existing family in [patterns](patterns.md), then inspect its implementation and tests. Record the meaningful differences in [feature-contract](feature-contract.md). Match action placement, density and interaction behavior to that family before introducing another variation.

Keep the initial surface focused on the frequent task. Reveal less frequent controls in the existing filter/view popover, action menu or floating sheet. Provide a visible action entry as well as context-menu shortcuts where appropriate; essential actions cannot depend on discovering right-click or hover. A quick editor should contain the common edits and a clear route to the full editor, rather than duplicate it.

## Behaviors to carry forward

| Decision | Finished reference | Acceptance evidence for a new feature |
| --- | --- | --- |
| Preserve context | Assessments URL filters and remembered return query | Open an item and return: relevant search, filters and page survive; switching academy uses the target scope |
| Keep visual choices local | Assessments Table/Cards and learning view settings | Switching layout makes no remote read; account preferences and responsive defaults remain distinct |
| Make filters coherent | Assessments dependent audience filters | Changing the parent clears invalid child selections; filter changes reset paging; clear/reset has predictable scope |
| Keep editing compact | Assessments Edit/Summary floating sheet | Common changes fit one flow; switching tabs preserves edits; full-editor navigation handles unsaved input |
| Commit what the user reviewed | Assessment quick edit | One Save commits related values together; no partial success disguised as a failed save |
| Protect work | Assessment conflict, reload and discard flows | Failed saves retain input; reload is explicit; pending saves prevent duplicates and unsafe dismissal |
| Restore the user's place | Assessment menu, sheet and calendar controls | Keyboard and pointer paths reach the same action; closing returns focus to the relevant opener |
| Show useful facts | Assessment parts, audience, dates and summary | Native status meanings and academy timezone stay accurate; long names remain usable; labels use the central palette |
| Recover within context | Assessment list refresh and Summary retry | A failed refresh retains safe cached content; only the failed area retries; failure cannot become a successful empty state |

Use these where the task calls for them. Do not add a sheet, preference store, confirmation or context menu solely to satisfy this table. The current learning search is limited to loaded pages; copying its visual layout does not authorize promising a full-catalog search. Existing assessment tooltips do not override the owner's helper-text rule.

## PR evidence

The existing `web` GitHub Actions job runs `npm test`, including Mones's assessment and label regressions. Relevant examples:

- `src/modules/assessments/components/page.test.tsx`: filters/paging, quick edit, one Save, permissions, dirty edits, focus restoration, labels and failures.
- `src/modules/assessments/queries.test.ts`: list response and request contract.
- `src/modules/assessments/view.test.ts`: view preference behavior.
- `src/components/shared/assessment/list/return.test.ts`: return navigation context.
- `src/lib/academy-time.test.ts` and `src/lib/palette.test.ts`: shared date and palette contracts.

For a new feature, extend its own tests with the relevant observable behaviors above. Avoid tests that only assert implementation classes or repeat a helper's code. Keep actual query-cache behavior in request-count tests; component mocks cannot establish authorization or layout.

The configured `ui` CI job runs `npm run test:ui` for the Coupons/History/Home fixtures and uploads review screenshots. These checks cover selected keyboard interactions, accessibility rules and responsive bounds. They do not automatically cover new screens: add representative fixtures/tests when changing a new family. Reviewed screenshot baselines and human judgment are still needed for visual quality. Passing tests alone cannot certify that an unfamiliar flow is easy to understand. See [verification](verification.md) for current coverage and its limits.

Review the rendered feature against its reference in both themes and a narrow viewport. Complete the real task, retry a relevant failure, return from a detail view and check preserved edits. Record that evidence with the change. Promote a reusable composition only after it solves a repeated need.
