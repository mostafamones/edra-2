# Group placement contract for the student milestone

Groups are scoped by `(academy_id, academic_year_id)`. Annual student records should hold one nullable `primary_group_id` and use a composite foreign key from `(academy_id, academic_year_id, primary_group_id)` to `groups`. Placement must match the student's level and track. A student can have at most one current primary group because the annual record holds a single reference.

When annual student records are added, extend the `protect_group_dependencies` trigger to block program changes and archival while a group has student records. Derive roster count from those current annual records, rather than storing a counter on `groups`. A later session roster should snapshot its expected students when the session is created so moving a student to another group does not rewrite past expectations.

No student placement screen or enrollment history is part of this module yet.
