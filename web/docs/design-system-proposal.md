# Edra design system proposal

Status: planning proposal, 2026-10-28. Recommendations below are not approved product requirements or authorization to implement. No application, dependency, CI, protected primitive, theme or Linear changes accompany this proposal. Existing local session-recovery and attendance work is separate.

## Objective

Follow-up: the [UI implementation guide](ui/README.md) now contains a deeper source-backed inventory, named component references, cache/request guidance, feature template and executable-test references. Its [audit](ui/audit.md) supersedes this proposal's initial inventory. The documentation's outdated Tabler statements have been corrected to the existing owner-approved Hugeicons rule; application/configuration migration and visual-reference approval remain outstanding.

Reduce repeated UI decisions and correction work by making approved Edra patterns the easiest implementation path. New features should choose an existing pattern and supply domain behavior, rather than invent page structure, action placement and error recovery again.

Success means less review rework and usable flows, not merely matching screenshots. Automated checks establish a minimum; human task walkthroughs still assess comprehension.

## Current evidence

Initial inventory inspected checkout `7b80390`. The branch was subsequently updated to `b8551c6`, which includes PR #47 and its Developer-mode failure simulator; existing uncommitted feature work was preserved. Recheck the inventory against the updated code before implementation.

- Root `AGENTS.md` already requires Hugeicons at stroke 1.5, concise labels without unsolicited helper text, and empty states replacing entire tables.
- `web/AGENTS.md` requires shadcn foundations and compositions outside protected `src/components/ui/`. Theme tokens and `components.json` remain owner-controlled.
- `web/components.json` uses radix-vega; `web/src/app/globals.css` already defines semantic theme and font roles. A new UI framework or root shared package is unnecessary.
- `web/src/components/shared/` has useful settings groups/rows, header actions, inputs and filters. These are a starting inventory, not a fully reviewed pattern catalog.
- `web/eslint.config.mjs` has Next/TypeScript rules, but no Edra-specific design enforcement configuration. Playwright's general config targets `smoke.spec.ts`, desktop Chromium and failure screenshots. The attendance config adds authenticated attendance coverage. These do not constitute a general visual-regression or accessibility gate.
- No Storybook or axe dependency was found in `web/package.json`; no general UI contract documentation or screenshot assertions were found in the inspected documentation/shared-component/e2e paths. This is a bounded inventory, not an accessibility audit of every screen.
- Linear EDRA-95 and EDRA-107 are Done historical component/polish slices. Their descriptions explicitly limit verification claims. Keep them closed; a new system would extend those foundations.

### Contradictions to resolve before implementation

1. `docs/engineering/brand.md`, “One identity across applications,” says ordinary icons use Tabler; the current root Icons rules require Hugeicons. `web/components.json` also still declares Tabler, and shared application components retain Tabler imports. Recommendation: the newer owner rule governs; change the brand sentence to “Ordinary application icons use Hugeicons with stroke width 1.5.” Plan application icon migration and a separately owner-controlled configuration correction. Do not manually patch protected shadcn files.
2. Brand documentation records agency work as outstanding and says the current UI is not final brand approval. Recommendation: standardize behavior/layout and use existing tokens provisionally; confirm the agency's latest deliverables before freezing final colors/fonts. Do not create a competing brand.
3. Proposed empty-state examples from external systems sometimes add explanatory paragraphs. Edra prohibits unsolicited helper text. Recommendation: retain Edra's rule; use a concise state title and permitted action. Required errors and lock/permission feedback remain functional status messages.

`rtl: false` in configuration alone does not prove Arabic layouts are broken. Audit actual Arabic content, mixed numbers and direction before proposing configuration changes.

## Relevant practices elsewhere

- [Atlassian AI guidance](https://atlassian.design/get-started/develop/with-ai) identifies task-specific agent skills for components, content, styling and accessibility. Its [tools](https://atlassian.design/tools) include lint rules and theme testing. Adopt focused agent context plus enforcement; private Atlassian skills are not an available Edra dependency.
- [IBM Carbon's checklist](https://www.carbondesignsystem.com/getting-started/contributing/component-checklist) treats states, responsive behavior, accessibility, code, documentation and testing as component readiness criteria. Adopt explicit readiness and a small definition of done; do not copy its enterprise process or coverage percentage wholesale.
- [Adobe Spectrum tokens](https://spectrum.adobe.com/page/design-tokens/) express reusable design decisions. Map Edra's existing semantic roles rather than choosing new raw colors in each feature.
- [GOV.UK patterns](https://design-system.service.gov.uk/patterns/) document task/page solutions as well as individual controls. This is the most useful missing layer for Edra.
- [Storybook testing](https://storybook.js.org/docs/writing-tests) supports reusable state examples, interaction checks and visual/accessibility tooling. It is a possible catalog host, not the design system itself.

These are documented public practices, not evidence of a guaranteed delivery-time saving for Edra.

## Options

| Option | What it includes | Tradeoff |
| --- | --- | --- |
| A. Written contracts | Short guidance, examples and review checklist; current components/tests | Fastest start, but agents can drift and reviews still carry much of the burden |
| B. Contracts + Edra pattern catalog — recommended | Short guidance, reusable compositions, deterministic state examples, targeted Vitest/Playwright/axe checks | Moderate setup; reuses current tools and directly reduces repeated implementation choices |
| C. Same contracts hosted in Storybook | B plus a dedicated component workbench, stories and associated test integration | Better isolated browsing as the catalog grows, with extra Next/RSC integration and maintenance to validate |

Start with B. Evaluate C after two representative features prove the pattern structure. No paid visual-testing service, new design tool or replacement component library is needed to begin. Any later hosted-service choice needs its own cost/data review.

## Proposed system layers

1. **Foundations:** semantic color/type roles, spacing/density, page widths, responsive rules, focus, motion and Arabic direction. Reuse current tokens; protected changes require the owner.
2. **Controls:** existing shadcn components. Document approved uses and variants without reproducing upstream documentation.
3. **Edra patterns:** reusable list, settings, editor, review/confirm, audience selection and async/error compositions. Extract actual repeated structure; avoid one universal page/form component with many flags.
4. **Task examples:** approved reference screens and their states, showing how patterns compose. Staff density and student learning readability may use distinct documented variants within one system.
5. **Contracts and checks:** each stable pattern links its implementation, state fixtures, relevant tests and review criteria. Styling exceptions remain explicit and reviewed.

## Small first contract set

Proposed canonical home: `web/docs/ui/`, with one short index and focused foundation/pattern pages. Shared brand authority stays in `docs/engineering/brand.md`. This proposal does not create approved contracts yet.

- **Page/action layout:** headings, content widths, primary/secondary action placement and responsive behavior. Pick one placement for each page family, including whether it uses the existing header action slot.
- **Lists:** search/filter/sort, active filter indication, pagination, selection, row actions and both empty states. Keep controls available when the table is replaced.
- **Forms/editors:** field labels, validation, dirty/saving/saved states, submit failure, destructive confirmation and keyboard focus. Product-specific persistence/publication rules stay in domain modules.
- **Settings:** reuse settings groups/rows with a narrow-screen arrangement; descriptions are not added by default.
- **Audience selection and short workflows:** searchable choices, clear selected state, sensible back/escape behavior and review before consequential actions. Keyboard and pointer paths should both work.
- **Async/errors:** initial loading, empty, no matches, recoverable fetch failure, failed save, stale data/conflict, forbidden, expired session and not found. Distinguish these states instead of mapping them all to generic validation.

Every pattern contract should answer: when to use it, approved composition/example, states and actions, keyboard/focus behavior, responsive and Arabic behavior, permitted variants, acceptance checks, and stability status. Keep detailed examples beside executable fixtures rather than duplicate them across documents.

### Example: list contract

Existing requirement: no records or no search results replaces the table, including headers; it does not render an empty row. Proposed additional behavior: retain search and filters; offer Clear filters only when relevant; retain Create only when permitted; do not use a success-empty state when loading failed. A read failure offers a safe read retry. Tests should verify this behavior and layout, rather than assert exact Tailwind class strings.

## Test and CI contract for Mones to implement

| Layer | Suitable checks | Limits |
| --- | --- | --- |
| Static | New disallowed icon imports, prohibited primitive edits, agreed token usage and selected accessibility lint rules | Start with changed files; narrow, actionable rules beat a broad regex that bans valid layout CSS |
| Interaction | Open/close, search/select, validation, pending duplicate prevention, focus restoration, keyboard completion and failed-save recovery | Prefer role/label-based assertions; share pattern tests rather than duplicate them in every feature |
| Accessibility | Rendered axe checks, semantic labels, focus visibility, keyboard navigation and manual screen-reader samples | Automated checks cannot establish full accessibility |
| Visual | Reviewed screenshots of stable patterns and representative pages at agreed widths/themes/directions | A screenshot match cannot establish that a flow makes sense |
| Domain integration | Actual authorization, session recovery and persistence journeys where affected | Mock state demos do not prove backend behavior; database fixtures remain in disposable CI only |
| Human walkthrough | A representative staff or student completes a realistic task without coaching | Record confusion and repeated corrections, not just visual preference |

Proposed starter viewport examples: 360, 768 and 1440 CSS pixels, plus zoom/reflow, long labels, Arabic/mixed-direction content and reduced motion. Confirm the actual support matrix before making every combination mandatory. Test representative combinations first, not every state's full Cartesian product.

Use the installed Vitest/Playwright setup as the starting point, then validate the selected axe/Storybook integrations against installed versions. Screenshot baselines should use one pinned CI OS/browser/font environment, deterministic data/time and controlled animation. Mask only genuinely variable regions. A human reviews baseline changes; never auto-accept a screenshot just because tests otherwise pass. See [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) and [accessibility guidance](https://playwright.dev/docs/accessibility-testing).

For Mones's Developer failure simulator, now included in PR #47, review its supported scenarios and coverage before extending it. Agree a finite scenario catalog keyed to the error contract. Reuse safe fixtures between the catalog and automated tests where practical. Simulated states must be developer/test-only, preserve tenant/role authority and synthetic external-delivery suppression, and never forge authorization or permit arbitrary execution. Manual state selection is useful for review; CI must reproduce the state without someone clicking through Developer mode.

## Delivery sequence and ownership proposal

1. **Inventory and settle direction:** shortlist approved current screens, identify repeated structures, confirm brand status and choose staff/student reference density. Capture actual disagreements once.
2. **Publish the small contract set:** short rules plus one visual/code example per pattern; record proposals separately from accepted defaults. Do not expand into a comprehensive documentation rewrite.
3. **Build two reference slices:** one list/settings flow and one editor/error flow. Candidates are Coupons and a content editor/attendance flow. Choose representatives with the owner; migrate only these slices initially.
4. **Connect quality checks:** Mones can retain CI/testing work; a separate design-system contributor owns contracts, shared compositions and examples. No Linear reassignment is implied here.
5. **Roll forward:** new UI follows stable patterns; existing UI migrates when touched or when defects justify it. Add a pattern only for a real missing case. Escalate novel interactions, not routine choices already settled by a contract.

Suggested readiness: Draft → Reviewed → Stable. Stable requires an approved example, relevant states, keyboard/responsive checks and passing agreed tests. Each PR names the pattern and supplies review evidence; it does not reopen the entire visual system. Track repeat review corrections, UI regressions and time spent fixing layout/interaction to assess whether the system is helping.

Suggested next backlog split: contracts/reference approval; shared patterns/pilot migration; deterministic error-state fixtures; CI/visual/accessibility checks; later Arabic and legacy-icon migration. Link the completed EDRA-95/107 work as foundations rather than reopening it.

## Decisions still needed

- Adopt B or invest in Storybook immediately? Recommendation: B first.
- Which current screens define the provisional visual direction? Recommendation: approve one staff screen and one student screen, then let the contributor derive routine defaults.
- Who can approve a new pattern or baseline? Recommendation: one named reviewer plus a backup; normal feature work uses existing approval.
- Initial enforcement scope? Recommendation: new/changed UI, two pilot flows, then incremental migration; no whole-app rewrite or blanket legacy freeze.
- Is there newer agency brand guidance? Apply it if supplied; otherwise keep provisional tokens and record that limitation.

Web comes first in this proposal. Native clients share terminology, brand and general behavior principles, while native layouts/components/tests remain in their own application scope.
