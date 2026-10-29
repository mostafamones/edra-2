# Feature contract template

Fill this in task notes or the implementation plan before coding. A few concrete lines per item are enough; do not create a second product specification. Plans remain unstaged unless explicitly requested.

## Task and source

- Actor, academy/portal and task:
- Approved product/API sections and permission rule:
- Existing pattern/component + relevant test:
- Difference from the reference, and why it is needed:
- For a new composition: two plausible approaches, chosen information order, and task-based reason for choosing it:
- Relevant [finished interaction decisions](quality.md): context preservation, action placement, progressive disclosure, save/dismissal and recovery:
- Unresolved consequential decision (if any):

## Interaction

- Entry → selection/edit → commit → destination:
- Main action and secondary/back action:
- Keyboard/focus and narrow-screen behavior:
- Loading / empty / no matches / read failure:
- Pending / success / failure or uncertain save / conflict:
- Locked / forbidden / expired session / not found (or why not applicable):

## Data

- Already-loaded data and whether complete or paginated:
- Public loader, query options/key and effective identity/tenant scope:
- Local derivation versus remote read:
- Freshness, prefetch/debounce and any exception:
- Write command and targeted update/invalidation:
- Late response/account/academy/preview switch handling:
- Request budget for the principal interaction:

## Evidence

- Interaction/cache regression cases:
- Actual rendered states/viewports/themes to inspect:
- Required domain/CI checks:
- PR tests covering the chosen interaction decisions, and rendered comparison with the reference:
- Verified outcomes and remaining limitations:
- Review task fit, hierarchy, interaction, data/authority and accessibility; distinguish implemented/tested/visually approved (see [review](review.md)):

Do not finish with only “matches existing UI” or “uses React Query.” Name the composition, observable behavior and cache lifecycle.
