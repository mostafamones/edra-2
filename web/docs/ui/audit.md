# Current UI audit

2026-10-28; inspected source at `b8551c6` plus the preserved local session/auth work. This is a bounded source/test audit, not a live authenticated visual or accessibility certification. Local session-recovery/attendance changes are not treated as merged reference behavior.

## Findings and recommended resolution

Follow-up: [the first pilot](pilot.md) fixes the coupon read-error/empty conflation and per-keystroke reads, links tabs to a panel, restores batch-sheet focus, and adds shared read states plus browser checks. Other findings below remain scoped backlog, not claims of completed remediation.

| Finding | Evidence | Resolution |
| --- | --- | --- |
| Icon documentation contradicts the current owner rule | `../engineering.md` UI and `../../../docs/engineering/brand.md` One identity still said Tabler; root/web AGENTS require Hugeicons 1.5 | Correct those factual statements to the already-approved rule. Legacy source and protected configuration migration remain separate |
| Shared controls do not all comply with icon guidance | `../../src/components/shared/app-input.tsx` and `assessment/edit.tsx` use Tabler; `filter-popover.tsx` has Hugeicons calls without explicit stroke width | Reuse behavior but don't copy these icon choices. Audit wrappers in a bounded migration; don't patch protected primitives |
| A failed coupon batch read can look empty | `../../src/modules/content/coupons/page.tsx`: error alert plus `!batches.data?.batches.length` branch | Proposed fix: error-without-data replaces the dataset; only a successful empty read shows No coupons. Add regression first |
| Coupon search requests on every input change | Same page: raw `search` is in the query key, no debounce | Proposed fix: debounce remote search and test rapid typing/current-result handling; preserve immediate visible input |
| Student search only covers loaded pages | `../../src/modules/learning/data.ts` first-page fan-out; `components/units-list.tsx` local title filtering and More links | Decide whether search means loaded courses or the full eligible catalog before changing it. Recommendation: full-catalog search for discovery; keep layout/grouping local |
| Student failure handling varies | `../../src/modules/learning/components/section.tsx` keeps failed sections distinct; `units-list.tsx` also shows an empty course state when all failed | Proposed fix: distinguish all-failed, partial and successful empty states; retain independently loaded academies |
| Strong shared-cache example already exists | `../../src/modules/content/panels.ts` and `panels.test.tsx` | Adopt the options-factory and request-count test pattern for equivalent panel/lookup data |
| Query scopes are inconsistent | `../../src/modules/groups/queries.ts` academy-rooted keys; `academies/structure/query-keys.ts` account+academy; coupons account+academy; auth lifecycle clearing | Audit identity-switch cancellation and late-response tests before any key migration. No unverified claim of a leak; no blanket key rewrite |
| Current shell/heading patterns differ | `../../src/app/globals.css` page-shell; Coupons' nested max-width; assessment edit hard-coded loading/error widths; student title weight | Choose reviewed reference variants, not one universal page component. Keep current tokens provisional pending brand approval |
| Shared settings rows have no narrow-width stack | `../../src/components/shared/settings-row.tsx`: horizontal row, shrink-0 control | Test long labels and wide controls; propose a wrapping/stacked variant only after seeing the failure |
| Useful tests are not a complete quality gate | `../../playwright.config.ts` smoke-only discovery, `../../vitest.config.ts`, `../../package.json` | Add explicit UI fixture discovery and visual/accessibility checks as a separate implementation slice |

## Decisions worth asking once

1. Approve two reference families and rendered examples before freezing exact dimensions/action placement. Recommendation: staff list plus content editor/command; retain the student list variant rather than force a staff layout.
2. Confirm the intended course-search coverage before a data change. This affects correctness, not just styling.
3. Approve the short AGENTS discovery sentence in [the guide](README.md); that file explicitly requires wording approval.

No need to reopen the already-agreed icon library, helper-text restriction, table empty-state rule, server permissions or existing domain save rules. No blanket UI rewrite, new framework, new offline store or paid testing service is needed to begin.
