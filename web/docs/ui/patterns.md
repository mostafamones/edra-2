# UI and interaction patterns

Read [status and authority](README.md) first. These are source-backed reuse recommendations; unresolved visual choices remain in the [audit](audit.md).

## Composition map

All paths below are relative to `web/src/`.

| Feature family | Start from | Reuse boundary |
| --- | --- | --- |
| Staff list | `modules/assessments/components/page.tsx`, `modules/content/coupons/page.tsx`, `components/shared/filter-popover.tsx` | Choose the appropriate paginated list, controls and table/empty replacement; assessment-specific grouping and permissions remain in its module |
| Color labels | `modules/labels`, `lib/palette.ts` | Reuse the academy label catalog and named shared palette; preserve written labels and selection state |
| Student courses | `modules/learning/components/units-list.tsx`, `view-settings.tsx`, `modules/content/student-cards.tsx` | Reuse course presentation and local view settings; do not treat a loaded page as a complete catalog |
| Student grouped lists | `modules/learning/components/section.tsx` | Preserve each academy's result/error independently; one failed academy must not hide successful ones |
| Settings | `components/shared/settings-group.tsx`, `settings-row.tsx` | Reuse group/row composition; optional description props do not authorize helper text; test narrow controls before adopting |
| Simple form | `components/shared/app-input.tsx`, existing `ui/field` primitives | Reuse label/error semantics; legacy icons in wrappers need separate migration, not duplication |
| Assessment authoring/marking | `components/shared/assessment/README.md` | Use shell, workspace, parts and marking contracts; modules supply validation, commands and domain differences |
| Content editing | `modules/content/components/editor.tsx`, `modules/content/panels.ts` | Reuse saved-versus-local state and shared panel queries; do not turn assessment authoring into a content-editor fork |
| Search/short command | `modules/navigation/search/menu.tsx`, `modules/sessions/components/command.tsx` | Searchable choices → review → deliberate action; reuse the real command primitive |
| Academic audience | `components/shared/level-track.tsx`, `modules/sessions/components/audience-filter.tsx` | Reuse dependent selection behavior appropriate to the domain; filters are not enrollment authority |

## Page and visual composition

- Start with `page-shell`, defined in `src/app/globals.css`, instead of recreating page padding and maximum width. Use existing semantic classes (`bg-card`, `text-muted-foreground`, `border-border`, etc.). Do not invent per-feature colors or edit owner-controlled tokens.
- For color-coded features use the central named palette in `src/lib/palette.ts`; see `docs/engineering/brand.md`. Existing assessment tooltips do not authorize adding unsolicited helper tooltips to new features.
- Staff pages already have `HeaderActions`, which portals actions into the site header. Use that slot for the same page family rather than adding duplicate action bars. Test the real header at narrow widths: a mocked portal does not prove the action is visible.
- Student lists place discovery/filter controls beside the title. Do not force them into a staff-only header slot.
- Preserve the nearest reviewed family's heading/density and card structure. Current screens disagree on heading weight and nested maximum widths; those details are not yet a universal standard.
- Keep the primary task visible. Put infrequent row actions in the existing menu/sheet pattern, and destructive actions behind the domain's existing confirmation. Do not introduce an extra confirmation for every ordinary save.
- At narrow widths, allow labels and action rows to wrap and inputs to shrink. Long Arabic/English names and codes must remain identifiable; don't rely exclusively on hover to reveal essential values. Do not put nested interactive buttons inside a whole-row link.

## Lists and selectors

Represent initial loading, loaded data, successful empty, no matches and failed load separately. A request error is never evidence of zero records. For a background failure, retain the last successful display with refresh/recovery feedback if retaining it is safe; do not destroy the working UI just because `isFetching` is true.

Use `FilterPopover` for compatible staff list filters; keep selection and reset behavior explicit. Reset pagination when the query scope changes. Preserve the relevant filters across pagination and return navigation. For dependent grade/track/group choices, clear invalid downstream values when the parent changes.

Use local derivation for view layout/grouping and complete loaded options. Use a server query when searching beyond a loaded page. “No matches in this page” and “No matches in the academy” are different promises; choose the intended scope before implementation.

## Forms and commands

- Every control needs an accessible label; an icon or placeholder alone is insufficient. Associate field errors with their inputs. Keep failed edits intact.
- Show pending state and guard repeated submissions in the command handler as well as the button. Keep the same request identity/payload for an uncertain retry when the domain supports idempotency.
- Separate a committed save from a failed follow-up refresh. Do not say “Save failed” after a confirmed write merely because a list refresh failed.
- Do not overwrite a dirty form with background data. Resolve version conflicts through the domain's explicit reload/reconcile path.
- Preserve product-specific save behavior. Content managers can publish current edits in one action; they should not be forced to save a draft first. Assessment draft/official-history rules are different and belong to their shared shell/domain.
- Search commands must work by typing and Enter, pointer and touch. Keep a visible back/close path, restore focus, and preserve useful search state on back. Escape behavior must follow the actual nested workflow rather than close an unrelated parent.
- The existing command shortcut is Cmd/Ctrl+K; the visible hint is `⌘ K` as requested by the owner. The Search button remains available. Do not use a global shortcut while ignoring editable targets or a pending consequential action.

## Required state decisions for a feature

| State | Expected interaction |
| --- | --- |
| Initial read | Named loading feedback; do not display a success-empty state yet |
| Empty / no matches | Replace the dataset; retain allowed create/reset/search controls |
| Read failure | Specific affected area and safe retry; preserve independent successful areas |
| Pending mutation | Disable duplicate command, show progress, retain context |
| Failed/uncertain mutation | Preserve input; retry safely or reconcile with persisted state |
| Conflict | Preserve local values and expose the domain's resolution; no silent overwrite |
| Forbidden / locked | No actionable link that leads to an avoidable denial/404; show the permitted recovery/status |
| Expired authentication | Use the auth flow; do not translate it into “check fields” or retry indefinitely |
| Not found | Distinct from permission, empty results and service failure where the server contract permits that distinction |

Not every feature needs every state. Record explicit exclusions instead of implementing fake general-purpose recovery. Test keyboard focus, long content, zoom/reflow and mixed-direction text on the actual composition; source inspection alone does not establish usability.
