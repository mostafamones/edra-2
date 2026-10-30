# Reference decisions from Mones's finished flows

Read the implementation and relevant tests before borrowing. These are behavior references identified with the owner, not claims that every line is authored by Mones or every pixel is approved. Rechecked against the local checkout on 2026-10-29. Paths are relative to `web/`.

## Owner calibration: what good feels like

The owner identified staff schedules, attendance, account settings and team as strong references. The refined content editor feels straightforward to a first-time user without sacrificing features; the owner specifically likes inline renaming on hover and contextual keyboard controls. Student Discover unit cards are a strong direction: they show the necessary information without clutter. These are endorsements of the experience, not blanket approval of every state or screenshot baseline.

Start with `src/modules/schedules/components/schedules-page.tsx`, `src/modules/attendance/components/overview.tsx`, `src/modules/account/components/settings.tsx`, `src/modules/staff/components/team-page.tsx`, and `src/modules/content/student/card.tsx`. Inspect the relevant surrounding components and live screen before copying a visual decision. Compare equal viewport, theme and realistic content; source inspection is not a visual comparison.

### Content editor: the refinement, not just the look

Git history shows a progression: commit `471442a` organized material, settings, review and access into persistent panels and moved actions into the shared header; `6f3af51` added draft autosave on blur, contextual publication actions, floating settings and query prefetch. The current `src/modules/content/components/material.tsx`, `list.tsx`, `bar.tsx` and `editor.tsx` show the inline title, selection and keyboard-oriented controls. The earlier editor and the refined editor were not rendered side by side for this review, so this is a code/history comparison, not a visual test.

Translate that into decisions:

- Make the common object and its immediate actions understandable first; reveal advanced settings where the task needs them, rather than presenting every control at once.
- Enable quick edits in context when appropriate, preserving a clear focus state, accessible name and touch/keyboard access. Hover can reveal an affordance; it must not be the only way to discover or operate a necessary action.
- Show relevant contextual actions when selection or keyboard work calls for them. Preserve focus after reordering; don't require keyboard users to memorize undiscoverable shortcuts.
- Keep work mounted across context changes; indicate save failures and retain input. Autosave is a domain-specific interaction, not a universal default: preserve explicit save/publication and review rules where they apply.
- On student cards, show the facts that let a student decide what to open, grouped by importance. Do not add decorative badges, metadata or controls just to fill space. Keep status and access truthful and actionable.

For future UI review, explicitly ask: could someone understand the first action without training, and can a returning user perform frequent tasks quickly? Inspect both the initial state and the richer interaction; visual simplicity must not hide inaccessible functionality.

| Reference | Decision worth preserving | How to demonstrate it | Do not copy blindly |
| --- | --- | --- | --- |
| `src/modules/assessments/components/toolbar.tsx` | Type navigation uses the shell; search stays accessible while less frequent filters share one surface | Type, filter, reset, navigate back; dependent audience fields remain valid | Assessment-specific types/roles or an icon-only control without an accessible name |
| `src/modules/assessments/components/quick-edit.tsx` | Edit/Summary preserve local draft; leaving while dirty is deliberate; dismissal returns focus | Edit, switch tabs, return, cancel dismissal, finish and resume at opener | Its query lifetime as a universal caching policy |
| `src/modules/assessments/components/page.test.tsx` | Interaction tests cover context, failures and permissions, not merely component presence | Trace a changed requirement to the corresponding regression test | Treating mocked permissions as server authorization evidence |
| `src/modules/learning/components/view-settings.tsx` | Compact local presentation controls with explicit selection state | Change layout/grouping and retain the relevant data; verify no unnecessary remote read in the real consumer | Assuming loaded-page filtering searches everything; double-click as the only route to a required action |
| `src/modules/content/panels.test.tsx` | Shared cache lifecycle is observable: prefetched reads are reused and invalidation is targeted | Count loader calls through the real QueryClient and consuming components | A mocked query hook or render count as proof of network savings |
| `src/modules/sessions/components/command.test.tsx` | A short command stays keyboard-operable while audience selection and review remain explicit | Type a choice, go back, change audience, review and start once | Expanding every form into a multistep command |

## Turn a reference into a decision

Record: “I am borrowing **[behavior]** from **[file]** because **[task]** has the same need; **[difference]** remains domain-specific.” “Looks like Mones” is not sufficient.

Capture the reference and candidate in the same theme, viewport and realistic data density using the owner's running instance. Compare hierarchy, action visibility, alignment, density, context and recovery. Screenshots should use synthetic or approved non-sensitive data. When no running instance is available, record visual review as pending; do not start a server or substitute a source review for visual evidence.

## Reference lifecycle

- **Source-backed:** behavior has been inspected in code/tests; visual approval is not implied.
- **Visually reviewed:** a named reviewer has assessed the actual rendered states; record date, revision, states and limitations.
- **Approved baseline:** the owner/reviewer has explicitly accepted the captured comparison artifact. Only then use it as a screenshot regression baseline.
- **Superseded:** keep the rationale/history, point to the replacement and stop recommending the old pattern.

The current Home pilot and synthetic Coupons/History previews are source-backed test surfaces. They are not automatically approved visual baselines. No approved baseline registry exists yet; do not invent approval records. On first approval, record its revision, artifact location, states and reviewer alongside the owning feature's evidence.
