# Data and cache contract

The objective is to reuse work without confusing cached display data with current authority. This is implementation guidance grounded in the current code, not a mandate to convert all Server Components to client queries.

## What exists today

| Layer | Evidence | Meaning |
| --- | --- | --- |
| Browser query cache | `src/lib/query-client.ts`, `components/providers/query-provider.tsx` | One browser QueryClient; global query stale time 60 seconds, retry 1. The server gets a new client. This is memory reuse, not a persistent/offline database |
| Shared panel options | `modules/content/panels.ts` | `unitPanelOptions(academyId, unitId)` supplies the same key, loader and freshness to prefetch and consumers |
| Paginated assessment list | `modules/assessments/queries.ts`, `modules/assessments/README.md` | Server-filtered pages and totals; its zero stale time is deliberate so workspace edits appear on return |
| Academy labels | `modules/labels/queries.ts` | Shared academy-scoped catalog; definition changes refresh the catalog and consuming lists |
| Lookup reuse | `modules/sessions/components/use-schedule-options.ts` | Existing group/structure keys and public APIs are shared; the startable schedule variant has a distinct result shape/key |
| Request-level server reuse | `modules/students/enrollment/server.ts` | `listMyStudentAcademies` uses React `cache`; repeated calls in a server render are not automatically repeated database reads |
| Local presentation state | `modules/learning/components/units-list.tsx` | Layout/status/grouping/search operate on loaded items; changing academy/paging navigates for new data |
| Durable unsaved work | `modules/assignments/student/local.ts`, `modules/exams/student/answering/` | Account-scoped draft recovery and pending operations, not submitted work or permission grants |
| Expiring media URLs | `components/shared/assessment/images/context.tsx` | In-memory keys, expiry-aware freshness; student resolver scope separates account/attempt context |

## Before adding a request

1. Identify the existing public loader and query-key/options factory. Check parent props, auth context, server-render data and query cache before adding another endpoint call.
2. Record scope: effective account/preview identity, academy, academic year, entity and result parameters where relevant. Reuse an existing key only when its meaning and returned shape match exactly. A restricted list cannot share a key with an unrestricted list merely because both contain schedules.
3. Determine whether the available data is complete. Derive labels, counts and filtered options locally only when the loaded data supports that promise. Never calculate academy-wide totals from one page.
4. Decide freshness and invalidation before writing the UI. Keep existing defaults unless the domain requires a different lifecycle; document each override's reason.

## Read rules and exceptions

- Reuse one options factory for prefetch and consuming hooks. Fresh prefetched data should open the intended panel immediately without an additional request. `modules/content/panels.test.tsx` tests exactly this.
- Do not create a QueryClient inside a feature or add parallel `useEffect(fetch...)` state for data already owned by a query hook. Local form state remains separate from server state.
- Enable optional queries when their prerequisites and UI context are ready. Prefetch likely next-step data where there is evidence of value; do not preload every hidden page, every academy or every student's records.
- Avoid a new remote request for purely visual changes. Debounce remote text search, ignore outdated results, and use cancellation when the transport supports it. Do not debounce the visible input itself.
- Live session checks, changed membership, access expiry, conflict resolution and retry reads may need fresh data. Do not suppress these to satisfy a blanket “zero requests” rule.
- `AssessmentEditGate` deliberately uses an isolated edit key, infinite freshness while mounted, no focus refetch and zero inactive retention to protect its starting version. This is an editor exception, not a suitable global cache policy.
- Command search deliberately disables retention/focus refetch and uses a 250 ms debounce/minimum query length. Review privacy/freshness requirements before changing that policy.
- Server-rendered lists may legitimately stay server-rendered. Reuse request-memoized domain reads; avoid adding a second client fetch of identical data on mount. If introducing hydration, use the same validated scope/key/shape and timestamps rather than pretending old data was fetched now.
- Keep signed URLs/tokens out of persistent storage. Cache duration must respect their actual expiry; possession of a cached URL or grant snapshot never replaces server checks.

## Mutation and identity rules

Capture the target academy/entity before starting a write. Use the existing mutation response to update a cache only when it is the authoritative complete shape for that key. Otherwise invalidate the smallest affected domain roots, including dependent detail/list/panel queries. Avoid global `invalidateQueries()` as a default.

Only invalidate the target scope, even if the user switches academies while awaiting the result. A late response must not navigate, toast, overwrite a form or populate a cache for the new identity. Use existing scope guards and identity handling rather than inventing local sign-in state.

Inspect `auth/components/membership-guard.tsx` for cancellation/removal of academy data and `lib/query-client.ts` for cache clearing. Account/preview transitions need explicit coverage; several legacy keys include academy but not account and rely on lifecycle cleanup. Do not assume those keys are independently safe across identity changes, and do not fork every key without reviewing all writers/invalidations.

Do not optimistically grant access, consume coupons, publish assessments or finalize attendance from cached expectations. Follow the trusted domain command and its concurrency/idempotency contract. UI can disable a duplicate click; only server enforcement can prevent concurrent duplication.

LocalStorage/sessionStorage drafts must remain account/entity scoped, reconcile against saved versions, tolerate unavailable storage, and never masquerade as server acknowledgement. Do not add a second persistent general data cache to solve repeated reads.

## A concrete request budget

Set budgets per interaction, after accounting for retries and invalidation—not per entire page:

| Interaction | Proposed acceptance |
| --- | --- |
| Open a freshly prefetched content panel | No extra panel load; show the cached result |
| Reopen unchanged panel within its freshness window | No additional load |
| Switch layout or sort a complete local collection | No API/Supabase read |
| Search a paginated remote collection | Debounced query scoped to current input; late prior result cannot replace it |
| Save a record | One logical command; targeted cache update/invalidation; independent domains unchanged |
| Refresh stale/live authority | Required revalidation allowed; stale display cannot authorize the action |
| Switch academy/account/preview | No previous scope's data or late response appears |

Test loaders/transport calls using one real QueryClient and actual consumers. Counting how many times a hook renders is not a network test. Do not claim end-to-end network savings from a mocked loader alone; measure transport/server reads for that stronger claim.
