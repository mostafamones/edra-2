# Public booking

Implements EDRA-231. Product rules: [student intake](../../../../docs/product/domains/student-intake.md); year start in [`academies/years`](../../academies/years/README.md).

## Flow

1. Managers configure the open year on Manage → Bookings (`/<slug>/manage/bookings`). Instructors read the settings and copy the link. The first save creates the academy's stable booking token.
2. `/invite/booking/<token>` (student host, public) reads the form with `get_student_booking_form`. A signed-in student is classified first with `preview_student_booking_entry`: a first-time student gets the form prefilled (`form`); a student with an academy relationship (`existing`, `enroll`, `connected`, `staff_help`, …) is sent to `/invite/booking/<token>/join`, which stores the booking entry in the pending cookie and opens the shared academy onboarding. Signed-out visitors may use the form or sign in through `/join`.
3. `submit_student_booking` creates a record-only registration: a new academy profile, or the unique historical profile for the phone. It never creates or links an account or grants access. Signed-in students with a relationship get `continue`.
4. Successful registrations stay ordinary student records; the page lists them from receipts (form and onboarding creations, not existing-record connections).

## Data and authority

- `student_booking_links` (one opaque token per academy, independent of the student invite), `student_booking_settings` (per year: `is_open`, `allow_without_group`, `participation_mode`, `excluded_level_ids` for trackless levels, `excluded_track_ids`, `excluded_group_ids`, `revision`) and `student_booking_receipts`. Clients have no table grants.
- A new year has no settings, so booking starts closed. Every live level, track and group is offered unless excluded, so offerings added later are bookable without another save. Exclusions are intersected with live offerings and active groups on every read and write; a level with active tracks is bookable only through tracks that are not excluded. Opening requires one registration path. Saves check the expected revision (`stale`).
- Submission takes the retry key, observed year and revision. Identical retries return the receipt (even after closure); a changed payload cannot reuse a key. Stale year/revision return `changed`.
- Outcomes: `registered`, `already_registered` (phone in this year, archived included), `closed`, `unavailable`, `invalid`, `changed`, `invalid_choice`, `group_full`, `validation` (with field), `rate_limited`, `staff_help`, `continue`. Anonymous responses never include record or profile details.
- Capacity counts non-archived records in the group under the same row lock as invite onboarding. Staff creation, import and placement keep their ability to exceed capacity.
- Durable quotas in `edra_private.student_booking_quota`: 300 submissions per academy per 10 minutes and 10 per phone per hour, charged inside the database function so direct RPC calls cannot bypass them.
- Anonymous creation sets `created_by = null` with `created_via = 'booking'`; signed-in submissions record the real actor without linking it.

Lock order is documented at the top of `20261025191000_student_booking.sql`. SQL coverage: `supabase/tests/student_booking.sql`; races: `concurrency.sh` section B.

## Not implemented

Link rotation, waitlists, custom fields, notifications and approval queues (out of scope by product decision).
