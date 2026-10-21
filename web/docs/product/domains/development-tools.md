# Development academy and Developer mode

Final owner decisions recorded 2026-10-21. This document defines the development tooling scope; implementation requires a separate implementation thread.

## Dataset

Create one synthetic academy in the existing cloud development Supabase project. Start with 20 fictional students and history **within the current academic year only**, beginning no earlier than August 16. This supersedes the original three-month request where it crosses the academic-year boundary. Expansion to 300–500 students is a later decision.

Generate believable Egyptian names and valid-format synthetic contacts, with uniqueness where required. Use seeded randomness so a recipe, seed and reference date reproduce the same scenario. Secrets are independently random. Synthetic contacts must never receive actual OTPs or messages, including messages redirected to the developer by WhatsApp development routing.

Students have compatible levels, tracks and groups, linked test accounts, and correlated patterns of attendance and academic performance. Include attendance, recorded physical assignment work, exam work and published scores. Include missing work and work awaiting marking or announcement. Do not invent replacement resolution or include quizzes in the first dataset.

Generate actual records consumed by existing application services. Do not implement missing portal features, redesign screens, fabricate unsupported result visibility, or claim that seeded data proves a working UI. Recorded physical assignment work does not provide student online assignment submission.

## Normal access

Add the owner's existing account to the synthetic academy as an Instructor. The academy appears in normal staff academy switching. Generated staff include an Owner, Head Admin, Admin and multiple Instructors. Generated student identities belong to the synthetic academy.

Developer authorization is separate from academy membership and roles. Initially only the owner's explicitly authorized account has it. Being an academy Owner never automatically grants Developer mode.

## Developer mode

Expose **Developer mode** in the authorized account's sidebar account dropdown in the development app.

Entering Developer mode shows a persistent frame around the normal application, with a top bar showing **Viewing academy as**, a staff identity/role selector, and **Exit preview**. Role choices use dedicated test accounts with actual server/database permissions, including distinct instructor identities.

In the synthetic academy's student directory, **View as student** opens the selected linked student's real portal within the same preview frame. It is a developer action, not an instructor permission in ordinary academies. The frame identifies the student.

**Return to staff** restores the previous staff test identity and directory context. **Exit preview** restores the owner's original identity and academy context. The controls remain accessible while viewing test identities.

Actions in preview persist to the synthetic academy. Normal authorization, tenant boundaries, snapshots and history rules apply. Switching clears account-specific cached state. Reuse existing shared staff/student auth cookies: the owner accepts that switching affects other open development tabs. Independent sessions per tab are outside scope.

First implementation target: local Next development execution against the configured cloud development project. Hosted preview activation is separate work; no production activation is included.

## Lifecycle

Generation is a developer command with a read-only dry-run and verification. It does not automatically delete prior data or rebuild after a failure.

Provide a **separate destructive reset procedure** for a registered synthetic run. Preserve the real owner's account and all other academies. Review exact run impact before destructive execution; this planning decision does not authorize a reset during planning. Retrying generation must not duplicate accounts or silently destroy data.

## First-run exclusions

No quizzes, replacement matching, prior/closed-year fixtures, content units, video provisioning, files/media, parent reporting, parent-message delivery, coupons, correction histories or native app implementation. Existing placeholder pages remain placeholders.

## References

- Implementation briefs: [development tools plan](../../../planning/development-tools/README.md).
- [Academic-year rules](academic-structure.md#academic-years).
- [Staff/student permissions](../permissions.md).
