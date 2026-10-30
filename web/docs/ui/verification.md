# UI verification

Current inventory checked 2026-10-29. These are configured checks, not proof they ran on GitHub. Use [review](review.md) for acceptance and [data](data.md) for request budgets.

## What is enforced today

| Layer | Actual check | Limit |
| --- | --- | --- |
| Component/domain behavior | `npm test`, configured CI `web` job | Named behaviors only; mocks cannot establish backend authority |
| Targeted UI/cache tests | `npm run test:ui:unit` | Convenience subset, not the whole suite |
| Browser fixtures | `e2e/ui/reference.spec.ts`, `npm run test:ui`, configured CI `ui` job | Home/Coupons/History production components with synthetic data, not authenticated whole-app tests |
| Accessibility/layout samples | Axe, document overflow checks and selected keyboard flows | Not full WCAG conformance or usability proof |
| Review screenshots | CI `ui-review` artifact | Capture is not comparison or visual approval |
| Optional visual comparison | `EDRA_UI_VISUAL=1` for Coupons | No approved baseline set; not a default CI visual gate |
| Icon imports | ESLint restriction for Coupons and QueryContent | No repository-wide change-aware icon/protected-file gate installed |
| Trusted persistence/permissions | Disposable GitHub database checks and relevant integration tests | UI fixtures cannot replace these; never replay fixtures against shared cloud data |

## Local execution

The owner starts app/preview servers from VS Code. Agents must not start or restart them. UI Playwright only starts its server in CI; locally it targets the existing preview on port 3101, overridable with `EDRA_UI_PORT`. If unavailable, report browser verification pending. Do not set `CI` locally to bypass this rule. Inspect other test configs before execution: some launch servers implicitly.

Run repository-required lint/build and relevant tests for implementation without starting app servers. Documentation-only changes need link/content checks. Browser discovery (`--list`) establishes discovery, not passing browser tests.

## Evidence for the changed flow

1. Name the shortest complete journey and reference behavior.
2. Test relevant read/write states, role/scope transitions and return context. Explain inapplicable states instead of inventing them.
3. Test actual query consumers with a real QueryClient. Count transport calls when claiming network savings; distinguish loader evidence from network/database evidence.
4. Compare the rendered candidate with its reference using the owner's instance. Inspect both themes, 360/1440 px samples, long mixed-language text, keyboard, open overlays, zoom/reflow and reduced motion as relevant. Check the real shell before claiming header/focus behavior.
5. Report mocked/live boundaries, commands/results and untested limits. Green tests do not override a failed task or visual review.

## Grow coverage deliberately

Add fixtures for changed real compositions/states. Extend the existing CI job rather than adding a parallel test stack. Use deterministic data/time and stable browser/OS/fonts for screenshot assertions. Obtain explicit review of initial baselines; never regenerate them merely to make failures pass. Failure screenshots are diagnostics.

Mones's failure simulator supports selected network/unavailable/timeout/permission/conflict cases. Auth is excluded. Use it for controlled review where applicable; synthetic permission failures do not prove permissions. Do not intercept auth merely to force expiry.

Remaining gaps: approved visual comparisons, broader change-aware static guards and more real-shell journeys. These are gaps, not installed guarantees or authorization for new dependencies.
