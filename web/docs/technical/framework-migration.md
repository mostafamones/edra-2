# Framework migration verification

Integration review date: 2026-11-02. The candidate replaces Next.js with TanStack Start/Router, Vite and Cloudflare Workers. This record describes local source and verification evidence; it does not authorize deployment or establish complete authenticated parity.

## Source coverage and boundaries

The baseline is `2031f337edf007b462a0c6d76bf2961cfa97edc4` (1,726 tracked paths). The migration ledger accounts for original paths by migration, verification, regeneration or unchanged bytes, with individual reasons. Deleted page/handler boundaries have replacement mappings; changed behavioral verdicts are bound to exact file hashes. The restricted root plan is classified by filename only and is never opened.

All 68 original pages, six layouts and 46 HTTP handlers have replacements. All 32 original server-action modules retain their 173 exported actions through 173 static server-function endpoints. These counts establish source coverage, not workflow correctness. HTTP adapters preserve the mobile bearer contracts; cookie server functions are not a native API.

Sensitive operations use server-only implementations behind validated server functions or server routes. The gateway owns host validation, session refresh, request cookies and response cookie/cache merging. Server request memoization is request-scoped. Browser cache and mutation lifecycles fence account/preview transitions and scope academy invalidation; cached data never grants authority. Independently callable shell/staff-entry/student-layout loaders now apply ordinary cookie authority, refusing recovery-only and missing-AMR sessions without depending on a page gateway.

Protected icons match the exact owner-approved frozen patch. A separately approved move of CSS to `src/styles/` changes only paths in configuration/guidance/imports; the protected globals stylesheet is byte-identical to the baseline. The unused Vite adapter for the removed `lcms-wasm` package was removed during integration. The active avatar implementation imports its pinned LittleCMS Wasm directly.

## Local evidence

The following checks executed serially from `web/` on 2026-11-02. Build/import-protection and workerd checks include the final removal of the unused LittleCMS bootstrap hook.

| Check | Local result |
| --- | --- |
| `npm run lint` | Passed, zero errors / 12 existing warnings |
| `npm run typecheck` | Passed, standalone route generation and TypeScript |
| `npm test -- --maxWorkers=1` | 254 files / 1,656 tests passed; one live-Mux test skipped |
| `npm run build` | Production build passed |
| `npm run test:workers` | Fresh production build, route-tree byte equality, application SSR/HTTP/RPC, real codecs, dependency and Mux crypto suites passed |
| `npm run check:client-secrets` | 231 JavaScript files and scanner self-test passed |
| `npm run test:edge` | Four entrypoints passed after correcting local PATH |
| `npm run test:edge:runtime` | Four tests / 31 steps passed with network denied |
| `npm run test:dev-academy` | 135 passed; one C++ compiler-dependent test skipped |
| `npm run test:e2e` | Four anonymous built-Worker browser tests passed |
| `npm run test:ui` | 13 synthetic UI cases passed, including responsive, retry, keyboard/focus and accessibility assertions |

The first Edge commands failed before tests because Deno was absent from PATH. Retried with the existing `~/.deno/bin/deno` 2.9.7 added only for those commands; no install/dependency change or assertion relaxation. Original failure logs remain in temporary evidence. Existing Vite native-loader/chunk/sourcemap warnings, jsdom navigation diagnostics and expected negative-request workerd logs remain visible.

The generated route tree must be included in the eventual migration commit. Standalone route generation and the production Start build must produce identical bytes; the Workers runner asserts this comparison. Do not stage the route tree merely to bypass the CI tracking check.

Existing anonymous browser comparisons cover marketing, login, signup and 404 across desktop/mobile and light/dark, including restored baseline Figtree wrapping and server-rendered 404 noindex. Browser/font-engine differences and the deliberate themed 404 are retained; this is not universal pixel parity. Smoke tests use an isolated built Worker with placeholder public Auth settings, empty storage and a network guard. UI tests use synthetic component fixtures. Neither suite is an authenticated application test.

## Retained compatibility choices

- `next-themes` is a framework-independent React theme provider. Its name does not imply Next.js runtime dependence.
- Legacy `NEXT_PUBLIC_*` fallbacks remain at the documented build/development-tool boundaries. Browser application configuration uses six explicit public `VITE_*` values; backend/provider secrets remain server-only. Older schema field names are not environment reads.
- The reserved `/_next` spelling remains compatibility routing behavior, with no Next asset handler or runtime dependency.
- Sharp is a development-only image oracle. Production uses precompiled Wasm/PDF.js/LittleCMS. Missing-IEND PNGs remain deliberately rejected. Valid-image resampling/CMYK differences retain the existing bounds; corrupt entropy can be repaired differently and is not covered by those valid-image pixel bounds. The 10,001-scan CMYK acceptance defect is fixed without increasing bounds. Broad real-world profile compatibility and deployed CPU/memory/startup remain unverified.
- Historical product/review records may mention Next.js. Current implementation guidance uses Start; historical statements do not become new requirements.

## Hosted and release limitations

After an authorized commit/push, observe all six GitHub CI jobs: web, e2e, ui, database, edge and attendance-e2e. Database/RLS/constraints/concurrency/migration replay and authenticated attendance execute only in disposable GitHub-hosted infrastructure. Attendance acceptance still requires two independent passing runs and a deliberately failing persistence/authorization control with cleanup/artifact evidence.

Real sign-in/out/refresh/recovery, revoked membership and cross-academy denial, signed-in three-host continuations, attendance persistence, assignment/exam writes, private learning, account/Auth/Storage changes and provider delivery remain unverified on this candidate. Prior anonymous/mocked tests cannot close those checks. Use controlled authorized accounts/targets; do not run fixtures against shared cloud data.

No deployed CPU, isolate memory, startup, production HTTPS/shared-cookie, DNS or performance compliance is established by a local build, process RSS, dry-run size or workerd execution. Deployment and worktree folder renaming are outside this integration review. Temporary migration evidence, journal, inventory and plans stay uncommitted; application code and CI do not read them at runtime.
