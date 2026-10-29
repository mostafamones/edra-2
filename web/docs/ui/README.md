# Implementing Edra UI

Use this guide before implementing a web feature. It records existing owner rules, inspected reusable patterns, and a proposed acceptance contract. It does not approve a new visual identity, change product permissions, or override `AGENTS.md`.

Status: updated 2026-10-29 against the local checkout. The [audit](audit.md) records historical findings. [Owner reference calibration](references.md#owner-calibration-what-good-feels-like) now identifies the specific screens and interaction qualities to carry forward; this does not approve every implementation detail or screenshot baseline.

The owner subsequently authorized implementation: [the first pilot](pilot.md) is now implemented locally, with a [live component preview](../../ui-preview/README.md), shared read-state composition and executable interaction/accessibility checks. Visual references still need owner review.

## Start here

Updated 2026-10-29: use [design decisions](decisions.md) to choose the surface and information hierarchy, [annotated references](references.md) to borrow from Mones's flows, and [review](review.md) to evaluate the result. [External research](research.md) explains the reasoning. For a new composition, compare two approaches briefly and state why the chosen one fits the task. Small changes within a proven family only need their relevant difference.

Read only the applicable family and examples after this entry point. The owner runs the app/preview from VS Code: agents must not start or restart servers, including indirectly through tests. Use the running instance; CI may manage its disposable servers. Record visual review as pending when unavailable.

Use [finished interaction references](quality.md) to carry forward the decisions in Mones's assessments and learning flows, and to choose the behavioral evidence a PR needs.

1. Read the applicable repository rules and the feature's assigned product/API contract.
2. Choose a family from [patterns](patterns.md). Inspect its named component and tests before inventing a composition.
3. Read [data and cache](data.md). Identify what is already loaded, what is complete versus paginated, and which public module API owns each read/write.
4. Fill the short [feature contract](feature-contract.md) in the implementation plan or task notes. Keep it unstaged unless the owner asks to commit the plan. Resolve consequential product gaps before coding; routine choices already covered here do not need another question.
5. Implement the smallest complete flow, including failure recovery. Use [verification](verification.md) to supply evidence, not just a successful build.

## Existing non-negotiable rules

- Existing shadcn primitives first. Do not hand-build equivalent dialogs, selects, menus or inputs. Compose Edra behavior outside `src/components/ui/`; protected primitives, `components.json` and theme tokens retain their approval rules.
- Hugeicons, stroke width 1.5. Official brand assets are the exception. Older Tabler imports are migration debt, not permission to add more.
- No unsolicited helper paragraphs, subtitles, tooltips or info icons. Use concise labels. Validation, access restrictions and recovery feedback are functional information and remain available.
- Empty datasets and no matching results replace the entire table, including headers and scroll wrapper. Keep relevant controls available.
- Server-side authorization and tenant boundaries remain mandatory, regardless of what a cached screen displays.
- Domain UI belongs in its module; shared compositions belong in `src/components/shared/`. Reuse the public module API rather than importing another module's internals.

## How this becomes enforceable

Written rules cannot guarantee first-pass usability. The practical target is fewer invented decisions: named compositions, explicit states, request-count tests, and reviewed visual examples. A feature should not be called complete solely because its happy path works.

The broader patterns remain an incremental adoption proposal; they do not claim that every existing screen already complies. [The pilot](pilot.md) records exactly which application and CI changes have now been implemented.

`web/AGENTS.md` now contains the discovery sentence proposed here and subsequently authorized for implementation:

> Before implementing web UI, read `docs/ui/README.md`, the applicable pattern and data/cache guidance, and record the feature's acceptance states and verification evidence.

The [documentation index](../README.md) links this guide now. The earlier [design-system proposal](../design-system-proposal.md) retains external research and options; this guide supersedes its initial inventory, not its unresolved approvals.
