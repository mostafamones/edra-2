# Task 2 — private registry, credentials and no-delivery handling

Prerequisite: task 1 passes. Read shared execution rules; final product sections Dataset, Normal access, Lifecycle; the existing Supabase skill; web/docs/engineering.md database guidance. Do not read task 4's switch implementation yet.

## Allowed edits

- Additive migration(s), regenerated database types, SQL authorization tests and selected test-suite registration.
- `web/scripts/dev-academy/{registry,credentials}.mjs` and scoped SQL support.
- `web/supabase/functions/_shared/whatsapp-auth.ts`, send-whatsapp-auth adapter/tests, account-contact/account-password functions/tests, plus a shared synthetic-recipient guard.
- New `web/src/modules/development/` server-only configuration/crypto utilities; no frame UI.

Create migrations with the installed CLI's documented command; never rewrite applied migrations. Use the configured cloud environment, not local Supabase. Read current official Admin createUser/password docs before using APIs.

## Fixed support contract

Use private `edra_private.dev_runs`, `dev_accounts`, `dev_contacts`, `dev_developers`, `dev_controls`, `dev_commands` and `dev_effect_suppressions` tables. The first three plus suppression records support generation; controls/commands support task 4. Do not expose the private schema through the Data API.

Run state: planned → provisioning → loading → ready, with failed/retrying bookkeeping; reset states are separately specified. Record recipe/seed/reference date/student count/scenario hash, exact project ref and academy ID, timestamps/error stage. Unique run/logical-account mappings support resume. No existing user/academy can be adopted by name or contact match.

Accounts: run ID/logical ID/role or student kind, Auth/profile/current annual IDs, credential ciphertext and provisioning state. Contacts: reserved student/staff/parent numbers registered **before** any account operation. Collision checks cover existing Auth identities and existing public student/parent contacts; abort instead of overwriting. Retain reservation/suppression until explicit completed cleanup.

Use cryptographically random passwords and AES-256-GCM server-side encryption with explicit project/run/user associated data and a server-only 32-byte key. No deterministic password derivation. Read existing secret configuration without printing it; missing credentials halt the dependent operation. Do not ask for secrets in chat.

Public RPC adapters for server/Edge access are service-role-only and use fixed empty search paths. RLS/revokes deny all ordinary browser reads/writes to private tooling state. Database triggers can read private suppression state internally. The registry, not editable user metadata, proves synthetic ownership.

## Delivery boundary

The authenticated Supabase Send SMS hook currently supports WhatsApp development routing and OTP logging. Check exact synthetic recipient membership **after hook signature verification but before logging or development routing**. For synthetic contacts return a functional rejection and make zero provider calls. Do not issue/log a usable code as a simulation of delivery. A registry lookup error fails closed.

Apply the same guard to account-contact and account-password code-delivery paths. Synthetic-account contact/credential changes are outside this development tooling task: return a functional unsupported-operation result instead of sending codes or silently replacing generated credentials. Ordinary account behavior stays unchanged. This boundary protects both fake recipients and the developer's real WhatsApp number.

Only the CLI Admin API creates generated phone/password accounts, setting confirmed phone status directly without signup/OTP/invite calls. Verify the deployed no-delivery guard with mocked provider tests plus a no-send hosted probe before provision. Do not send a live OTP to test the guard.

Add narrowly scoped insert triggers on attendance/assignment/exam effect outboxes: synthetic academy effects receive a private suppression record, ordinary effects do not. Extend existing attendance effect claiming to refuse synthetic-suppressed effects. No fabricated processed/delivered timestamps. Document the exclusion for future assessment/message workers.

## Acceptance

D1: anon/authenticated cannot read registry/credentials or call service-only RPCs; user_metadata cannot grant access.
D2: synthetic recipients never reach OTP logs, developer routing or provider calls; normal-recipient tests preserve current behavior.
D3: ordinary effects remain eligible; synthetic effects have explicit suppression, including effects made later during preview.
D4: Auth provisioning refuses collisions; a retry resumes exact run-owned accounts only.
D5: encryption round-trip succeeds, tampered/wrong-context ciphertext fails, and outputs/logs contain no secrets.

Run relevant Vitest/Edge tests, lint/build and isolated cloud authorization tests. Deploy only the affected cloud Edge functions needed for the authorized implementation and confirm the guard before handing off to task 3. If deployment access is unavailable, report D2's hosted portion blocked and do not provision users. No full shared-project SQL test suite.
