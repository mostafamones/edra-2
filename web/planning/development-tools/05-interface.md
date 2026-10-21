# Task 5 — preview frame and entry points

Prerequisite: task 4 endpoints/state tests pass. Read shared execution rules; final product Normal access/Developer mode; task 4's endpoint/state and safe display type contracts. Do not read historical loader SQL.

## Allowed edits

Create focused components/hooks in `web/src/modules/development/`. Integrate into:
- `src/modules/navigation/components/account-menu.tsx`;
- `src/modules/students/records/components/table/columns.tsx` and its owning page/table wiring;
- `src/app/layout.tsx` for one shared preview boundary inside existing auth/query providers;
- only necessary auth provider/cache invalidation hooks and tests.

Use existing shadcn Select, Button and DropdownMenu plus Tabler icons. Do not modify protected UI primitives, globals theme tokens or components.json. The frame wraps normal content, not an iframe or duplicated shell.

## Exact interaction

- Outside preview: authorized real developer sees Developer mode in account dropdown on either portal; others see no control.
- Enter opens the ready test academy in the generated Owner identity. The real account still normally belongs as Instructor.
- Persistent border/top bar: Viewing academy as, actual staff identity/role selector, Exit preview. Include all six staff targets, with distinct instructor names.
- Only generated linked student row actions expose View as student while a developer control is active. The same control is also available when the authorized developer browses the test academy normally: create a control preserving their real identity, then enter that student directly with their real staff directory context as return destination. Return to staff in this case restores their real Instructor identity **within the still-authorized control**, not a made-up generated identity.
- Student frame shows the selected student and Return to staff plus Exit preview. It persists across supported student portal navigation.
- Return to staff restores the previous actual staff identity and validated directory filters/page. Exit closes preview and restores the real developer's original context.
- Actions persist; no extra save/preview-only behavior. Controls disable while a switch is pending. Failed switch has functional error feedback; do not silently assume a new role.
- Navigation uses canonical app/student origins and full reload after session changes. Use existing provider cleanup and the backend's same-origin tab notification.
- Other academies get no student action. No developer search over arbitrary real users, dashboards, seed/reset buttons or helper text.

## Acceptance

U1: Entry visibility follows server authority, including while acting as a low-role target.
U2: All roles, two different students, direct student entry from the real staff identity, return and exit follow the state contract.
U3: Query/journal data from the prior identity never appears as the new identity's result after reload.
U4: Frame/controls work at desktop and mobile widths, keyboard accessible with meaningful labels, Tabler icons and visible pending/error state.
U5: Existing sidebar academy switching and normal non-developer flows remain operational. Placeholder pages remain placeholders.

Run lint/build and focused component tests for conditional authority/state transitions. Use the React best-practices skill after multiple TSX edits, as required by that skill. Complete browser acceptance in task 6; no broad UI redesign.
