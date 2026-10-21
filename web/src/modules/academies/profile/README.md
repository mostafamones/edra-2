# Academy profile

Staff settings page at `/<slug>/manage/academy` (EDRA-128). See [identity and staff](../../../../docs/product/domains/identity-and-staff.md) → Academy profile and contacts. Schema: migration `20261021161709_academy_profile_contacts.sql`. Database assertions: `supabase/tests/academy_profile.sql` and the Admin case in `supabase/tests/staff_access.sql`.

## Contract

- Editable: name (2–100), icon (one of `ACADEMY_ICON_IDS`), subject (1–60, free text), phone and WhatsApp. The slug, id, creator and timestamps are read-only; the schema rejects them rather than ignoring them, and the slug trigger still blocks direct changes.
- Phone and WhatsApp are independently optional Egyptian mobile numbers stored as `+201[0125]` plus eight digits (`normalizeEgyptianPhone`). Blank clears to null. They may match. They are not verified, not login identities and not messaging configuration, and they are not shown outside this page.
- Owner and Head Admin edit; Admin and Instructor read. The `academies_update_owner_or_head_admin` policy and the column grant (`name, icon, subject, phone, whatsapp`) enforce this for direct table access; `isAcademyProfileEditor` mirrors it for the UI and the action's early exit. `is_academy_manager` is unchanged, so Admin keeps manager authority elsewhere.
- `saveAcademyProfile(slug, expectedUpdatedAt, input)` resolves the membership from the session on every call and writes all five fields in one UPDATE guarded by `updated_at`. With no returned row it rereads: identical persisted values are a success (lost response or repeat), a newer `updated_at` is a `conflict` carrying the current profile, and anything else is `forbidden`. A committed save is reported even if the router refresh fails.
- The form keeps the draft on every failure. On conflict the user chooses "Load latest" or "Keep my edits" (adopts the newer baseline; the next save is deliberate). After a save the action refreshes the server layout and the client refetches memberships, so the header and switcher show the new name and icon.

## Verification limits

The action and validation have unit tests with a mocked Supabase client. SQL assertions cover grants, policies, constraints, atomicity and compare-and-update inside one transaction; there is no separate-session race test for two simultaneous saves.
