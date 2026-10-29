# Review before declaring UI complete

This is a short evidence gate, not a score to game. Apply relevant checks to the changed task; mark exclusions with a reason. Do not average a broken permission, inaccessible action or lost draft into a passing visual score.

## Before implementation

Record the task, reference behavior, proposed information order and data ownership in [feature-contract](feature-contract.md). For a new composition, briefly compare two approaches using [decisions](decisions.md). Resolve consequential product ambiguity with the owner; proceed with routine choices covered by the existing family.

## Review the candidate

| Dimension | Passing evidence | Blocks a completion claim |
| --- | --- | --- |
| Task fit | User can identify the next action and complete the agreed job without knowing backend concepts | Beautiful placeholders, dead destinations, unexplained scope or a page that only repeats navigation |
| Visual hierarchy | Rendered comparison with the chosen family; relevant controls, aligned facts and restrained containers | Inconsistent action placement, decorative prominence over real work, unreadable or clipped values |
| Interaction | Keyboard/pointer journey, return context and relevant dirty/pending/conflict cases | Lost work, hidden-only required actions, duplicate command or false save failure |
| Data and authority | Named query ownership, complete/paginated scope, measured reuse and scope-transition behavior | Extra duplicate reads, misleading totals, cross-identity data, UI-only authorization |
| Accessibility and resilience | Automated scan plus manual focus/reflow/overlay checks and distinct empty/error cases | Unreachable controls, obscured focus, failure presented as success-empty |
| Evidence honesty | Commands/results, exact browser states, mocked/live boundaries and untested gaps | Calling fixture tests live verification, screenshot capture regression coverage, or unrun CI passing |

If a dimension fails, fix it within authorized scope. If it needs missing data, an unresolved product choice or unavailable environment, identify that narrow blocker and report the other completed work accurately. Never label the whole feature verified while concealing the gap.

## Test design

Name tests as observable outcomes, for example:

- Changing a parent audience clears invalid selections and resets paging.
- Returning from a record preserves the prior filters.
- A failed refresh keeps safe cached content and retries only its region.
- Switching academy during an outstanding request never renders the old result in the new scope.
- Closing a sheet restores focus; switching its tabs preserves unsaved edits.
- A successful write followed by a failed refresh is not reported as a failed save.
- Opening a fresh prefetched panel adds no load; switching local layout adds no remote read.

Add only those relevant to the change. Test real production components and actual query clients; stubbing the transport is appropriate, replacing the behavior under test is not. Use the disposable CI database for server authority/concurrency. Screenshot tests complement behavior tests; neither substitutes for the other.

## Completion note

Use a few lines: task and reference; checks passed; rendered states inspected; actual cache evidence; unresolved limitations. Distinguish **implemented**, **tested locally**, **tested in CI**, and **visually approved**. Do not claim future CI or reviewer approval.

## Learn from review corrections

When the owner corrects an agent's UI choice, capture the specific failed decision and fix the owning recipe or add a regression. Do not create a new global prohibition for a one-off preference. If a correction repeats across two real features, evaluate a shared composition. Periodically remove duplicate/contradictory guidance rather than adding another checklist. The aim is fewer repeat corrections and successful tasks, not more documentation or test counts.
