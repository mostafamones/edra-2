# Local UI review

The owner starts the preview from VS Code with `npm run ui:preview` in `web/`, then opens `http://127.0.0.1:3101/`. Agents use that running instance and must not start/restart it. The UI Playwright configuration starts a preview only in CI.

This is a development-only Vite harness outside Next's routes. It renders the actual Coupons page and VersionHistory component. Vite replaces their action modules and auth context with synthetic fixtures; no database, real account, provider or credentials are needed. Writes return an explicit preview-only error. Nothing is added to the deployed app or its auth routing. Don't import these fixtures from application source.

Use View, State and Theme to inspect the examples. In History, edit the title, open History, retry a failure and close it with Escape. The surrounding title field is a fixture, not a second content editor. The production History panel and its query-options factory are the real components.

- `npm run test:ui:unit`: targeted feature/cache tests.
- `npm run test:ui`: isolated browser interactions, axe, responsive bounds and review screenshots. Install Chromium with `npx playwright install chromium` first. Windows can instead set `EDRA_UI_BROWSER=msedge` to use installed Edge.
- `playwright-report/ui/` and `test-results/ui/`: reports, screenshots and failed traces. CI uploads these as `ui-review`.
- `EDRA_UI_VISUAL=1 npm run test:ui` (set the variable using your shell): opt-in screenshot comparisons. Establish reviewed baselines on the chosen OS/browser with Playwright's `--update-snapshots`; do not automatically update them in CI. No approved screenshot baselines accompany the first pilot.

The harness uses existing theme CSS but local Arial/monospace fallbacks rather than Next/font downloads. Screenshots establish composition and state behavior, not final branded typography. A live application/font review remains necessary before visual approval. Automated accessibility checks do not establish complete accessibility.

Vite and axe-core were already in the lockfile as transitive dependencies. They are now explicit dev dependencies at the same locked versions; no new transitive packages or protected primitives were added.
