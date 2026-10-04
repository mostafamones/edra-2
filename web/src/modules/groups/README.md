# Group placement contract for the student milestone

Groups are scoped by `(academy_id, academic_year_id)`. Annual student records should hold one nullable `primary_group_id` and use a composite foreign key from `(academy_id, academic_year_id, primary_group_id)` to `groups`. Placement must match the student's level and track. A student can have at most one current primary group because the annual record holds a single reference.

`protect_group_dependencies` blocks program changes and archival while any annual student record (active or archived) references a group; student placement takes a share lock on the group so concurrent archival cannot interleave. Active student counts are derived from current annual records in `loadGroupDependencies`, rather than stored on `groups`. A later session roster should snapshot its expected students when the session is created so moving a student to another group does not rewrite past expectations.

Student placement lives in the students module (`src/modules/students/records/`); enrollment history is not modeled yet.
