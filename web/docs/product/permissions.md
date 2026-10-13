# Staff permissions

These are intended product permissions. Current source enforces the Owner, Head Admin, Admin and Instructor roles, and academy-scoped staff suspension, for the features that exist; rows for features not built yet remain intended rules.

| Action | Owner | Head Admin | Admin | Instructor |
|---|---|---|---|---|
| Academy closure/deletion; Head Admin appointment/role/suspension/removal | Yes | No | No | No |
| Manage Admins/Instructors | Yes | Yes | Instructor management only | No |
| Create student record and initial placement; edit contacts | Yes | Yes | Yes | Yes |
| Change existing placement/type; archive/restore/import/bulk placement | Yes | Yes | Yes | No |
| Manage offerings, years and groups | Yes | Yes | Yes | Read/use only |
| Recurring schedules | Yes | Yes | Yes | Read/use only |
| One-off schedules | Yes | Yes | Yes | Create/edit; archive own only |
| Start/end sessions; record/finalize/correct attendance | Yes | Yes | Yes | Yes |
| Archive/restore sessions in an open academic year | Yes | Yes | Yes | Read preserved history only |
| Prepare material and assessments; mark/announce complete results | Yes | Yes | Yes | Yes |
| Release/archive content | Yes | Yes | Yes | No |
| Correct shared answer keys/exclude questions after work begins | Yes | Yes | Yes | No |
| Assignment submission availability/archive | Yes | Yes | Yes | No |
| Manual learning grants/revocation/suspension; manage coupon codes | Yes | Yes | Yes | Inspect student access only |
| Manage parent report links | Yes | Yes | Yes | Preview only; no secret access |
| Notes | Manage | Manage | Manage | Create; manage own notes under sharing rules |
| Delivery diagnostics/retries | Yes | Yes | Yes | Basic delivery outcome only |

Role descriptions do not override domain conditions, year closure, tenant isolation, structure locks or academic history. Staff administration excludes self-role/self-removal changes. Read [academy](domains/academy.md), [students](domains/students.md), [teaching](domains/teaching.md), [learning](domains/learning.md), [assessments](domains/assessments.md) and [family](domains/family.md) for conditions.
