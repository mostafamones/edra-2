# Academic year learning start

Implements the manager-controlled year start from EDRA-231. Product rules: [academic structure](../../../../docs/product/domains/academic-structure.md) (Preparing and starting student learning) and [learning access](../../../../docs/product/domains/learning-access.md).

- `academic_years.student_learning_started_at` (with `_by` and `_source`: `manager` or `legacy`) is the only learning gate. Calendar dates and closure are separate; no scheduler starts a year.
- New years start unset (preparation). Years that existed when the column was added were marked `legacy`, so open years kept their availability.
- `start_year_learning(academy, year)` checks a live manager role, locks the open year and is idempotent. A start can't be edited or reverted (trigger), and a closed year can't be started.
- `get_year_learning(academy)` is readable by every staff role.
- Enforcement lives in `edra_private.student_caller_record`, the resolver behind every protected student learning service (content, coupons, assignments, quizzes, exams and their image/upload authorization). Account linking and the academy landing do not use it; `get_my_student_academy` reports `not_started` (suspension takes precedence).
- Starting does not issue, start, pause or reset grants or clear suspensions.

The manager action is composed on Manage → General.
