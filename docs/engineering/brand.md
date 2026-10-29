# Brand identity

## Current work and decision authority

The owner has sent a proposal to a product design agency, which is developing Edra's brand identity, including typography. The owner and agency will review the deliverables and agree which identity to adopt. No agency files or final selections have been provided in this documentation review.

Keep brand creation, refinement and application as outstanding work. Waiting for the agency does not remove it from scope. No exact delivery date is recorded here.

## One identity across applications

Edra's applications use one approved brand identity. This file is the canonical reference; web and mobile references link to it rather than maintain competing brand definitions.

Approved logo artwork, color roles, typography roles and product terminology are shared. Platforms may adapt layout, sizing, interaction and asset formats to their native foundations without inventing a different identity.

Ordinary application icons use Hugeicons with stroke width 1.5, as required by the repository's Icons rules. Brand logos use official assets and their brand colors by default, such as the multicolor Google sign-in logo; use monochrome, filled or other variants only when explicitly specified. Native assets retain source, version and license attribution. Standard system-controlled native UI follows the platform.

## Visual implementation

Web theme tokens and design-system configuration remain owner-controlled. Native implementation translates approved visual intent into platform assets and styles; it does not import browser components or modify web tokens to suit native code.

Arabic text and direction, accessibility and platform text sizing must be considered when applying typography and layouts. Brand consistency must preserve legibility rather than force identical dimensions on every platform.

## Reusable color palette

Confirmed by the owner, 2026-10-29: color-coded features use a fixed named palette with coordinated light and dark appearances. Define palette values in one central implementation source and reference stable color keys from records and components, so refining a color updates all its uses. Include the foreground, background, border and indicator appearances needed for legible controls and badges; color alone must not replace a text label or selected state.

[Labels](../../web/docs/product/domains/labels.md) are the first consumer, initially integrated with assessments. Keep this palette reusable for labels in additional modules, other color-coded features and academy colors without implementing those features now. Users choose named palette entries rather than arbitrary custom colors. Exact palette shades remain refinable; this decision does not declare a final agency brand identity or authorize changing protected web theme tokens, design-system configuration or primitives. Web implements the palette outside those protected foundations; native adoption follows when a native consumer is in scope.

## Context for the assisting agent

Edra serves academies, their staff, students and parents. Staff manage teaching and academic work; students navigate learning content, complete assessments and follow performance; parents consult reports and receive official communication. The identity must serve these connected experiences and the native staff companion.

Begin with the agency proposal, delivered guidelines/assets and the owner's latest selections. Review them with the owner against Arabic and Latin readability, right-to-left layouts, accessible contrast, dense academic screens and native text sizing. Distinguish proposed options from accepted identity decisions.

Help the owner refine the supplied identity and identify missing application guidance. Do not invent a competing identity or treat the current interface as the approved brand. Confirm source artwork, font usage rights, semantic color roles and any applicable variants before planning their application.

Record accepted decisions in the canonical shared brand reference, with links to the approved asset sources. Keep unresolved options in review/planning context. Then prepare app-specific implementation plans mapping those decisions to web tokens/components and native styles/assets, with representative screens for review.

Brand adjustment is authorized scope; it does not remove the existing protected-file rules. Plans must identify required owner-controlled token/configuration changes explicitly. Protected-file changes must be identified in the implementation plan and follow the applicable guidance.
