# External UX reasoning translated into Edra

Reviewed 2026-10-29. These are primary guidance sources, not endorsements of Edra and not instructions to copy another design system's styling. Owner rules and agreed product behavior take precedence. Local recommendations below are our interpretation.

| Source | Principle used | Edra application and evidence |
| --- | --- | --- |
| [Nielsen Norman Group: usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Visible status, recognition, user control, consistency and error recovery | Prefer identifiable choices over remembered codes; preserve work and return context; review a full task instead of judging its first screenshot |
| [GOV.UK: recover from validation errors](https://design-system.service.gov.uk/patterns/validation/) | Input errors need an actionable correction; permission/eligibility failures are a different problem | Field errors attach to their input. Test forbidden/service failure separately from validation; never tell users to edit correct fields to fix an unavailable backend |
| [IBM Carbon: loading](https://www.carbondesignsystem.com/building-blocks/core/patterns/loading) | Loading communicates progress; skeletons suit initial structured data rather than every UI element | Keep the shell and available controls stable. Use existing read composition for initial load and preserve safe cached content during refresh. Test first load separately from refresh failure |
| [W3C: focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) | Keyboard focus must not be entirely hidden by authored content | Exercise sticky headers, floating sheets and footer actions with a keyboard in the real shell; a focus class or axe scan alone cannot establish this |
| [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | WCAG 2.2 AA uses 24 × 24 CSS-pixel targets with defined exceptions, including spacing | Inspect compact icon controls and adjacent targets. Apply the actual criterion rather than claiming every smaller inline link fails; prefer comfortable existing controls for frequent touch actions |

## What we deliberately do not import

- Another system's fonts, color tokens, component package or page templates.
- A blanket requirement for explanatory text: Edra's no-helper-text rule remains in force.
- Arbitrary delays, skeletons for every interaction or a universal cache lifetime.
- A claim that these heuristics prove usability. They guide decisions; task review and user feedback still supply evidence.

## Keep research useful

When adding a recommendation, record its source, the concrete Edra decision, and how to verify it. Revisit sources when changing the corresponding pattern or accessibility criteria. Avoid accumulating links that no rule or review uses. For API/library behavior, inspect the installed version and its own documentation rather than using UX articles as technical specifications.
