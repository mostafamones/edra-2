# First implemented reference slice

2026-10-28. Implemented locally at the owner's request. No push or pull request. Visual approval remains with the owner.

## Scope and behavior

- **Coupons:** existing academy-wide product/permission rules retained. `coupons/queries.ts` owns account/academy-scoped read options. Search stays immediate locally and applies remotely after 250 ms; page resets with the applied query. Results from an earlier search cannot replace the current query's results.
- **Shared read composition:** `components/shared/query-content.tsx` composes existing Alert, Empty, Skeleton and Button primitives. Failed reads cannot become successful-empty states; retry targets the failed read; background errors keep nonempty cached content mounted. It does not implement authorization or mutation recovery.
- **Responsive batches:** existing batch actions render as cards on small screens and a table on larger screens. Empty states replace both. Accessible type tabs control a real panel. Closing details returns focus to the originating row action when it still exists.
- **Content editor/History:** the shared read composition preserves existing mounted content across refresh failures. History retains the shared prefetch/query key and retry path. The settings overlay cannot exceed its container width; the student search/tab row can wrap.
- **Agent entry point:** the approved discovery sentence is in `web/AGENTS.md`. The pilot's ESLint rule rejects alternative UI icon libraries in Coupons and the shared read composition; legacy migration remains separate.

## Review and verification

Use the [local preview](../../ui-preview/README.md), which renders production components with synthetic reads and disabled writes. Review normal, loading, empty and error states in both themes. The History example demonstrates the real panel; it is not a full content-editor integration test.

Forty targeted component/cache tests passed during implementation. The browser suite covers axe scans, 360/1440 px layouts, Arabic/Latin labels, populated History, search/reset, retry and keyboard focus recovery. It found and prompted fixes for missing tab-panel semantics, batch-sheet return focus and insufficient contrast in History's Live label. Existing unrelated lint warnings remain. The normal Chromium CI job is configured but has not run on GitHub.

Screenshot capture runs in CI; screenshot comparisons are opt-in until reviewed baselines are established for the chosen browser/OS. Preview typography uses explicit fallbacks. Do not claim pixel-perfect production fonts or general whole-app coverage.

Final local browser run: **8/8 passed in installed Edge**, including the populated History contrast fix. GitHub CI and approved visual baselines remain unverified.

The default production build hit local environment failures (Google Fonts access, then a Turbopack subprocess crash). The production webpack fallback (`npm run build -- --webpack`) passed, including TypeScript and page generation. Standalone typecheck passed after removing stale generated route types from before the rebase. The normal build script has not been changed.

## Next feature

Use `feature-contract.md`, the actual `QueryContent` API and query-options examples. Add tests to the relevant feature suite rather than copying the whole pilot. Extend the browser fixtures for real new states. Keep live authority checks, dirty-form reconciliation and domain commands in their owning modules; this composition is only for reads.
