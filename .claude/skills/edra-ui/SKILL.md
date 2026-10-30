---
name: edra-ui
description: Design and review Edra web interfaces using the owner's reference screens, existing components and scoped cache contracts. Use for new Edra UI or substantial UI revisions.
---

Read `web/docs/ui/README.md`, then the relevant family and `web/docs/ui/data.md`. For record/detail pages read `web/docs/ui/record-design.md`. Repository paths are relative to the checkout root.

Start from the user's likely task and available domain commands. Compare two compositions briefly before implementing a new page family. Keep frequent information visible; disclose secondary evidence in context. Do not treat the latest agent-created screen as an approved reference. The owner's Mones references govern density and interaction quality.

Use existing shadcn foundations, Hugeicons and Edra tokens. The optional frontend-design skill helps critique hierarchy and bland default composition; it cannot override repository protections or introduce a competing visual identity.

Implement actual states and actions, preserve tenant/identity authority and cache invalidation, and review the complete task in the owner's running app. Never start servers. Record tests, visual evidence and unverified states. Do not substitute decorative graphs for useful record information or claim every requested capability exists because its section is present.
