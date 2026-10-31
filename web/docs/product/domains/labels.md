# Edra — labels

Confirmed by the owner, 2026-10-29. These are approved requirements, not a statement of implementation or deployment.

## Shared feature and initial scope

Labels are a shared academy feature intended for use across multiple modules. Each module has its own label catalog in an academy, retained across academic years (owner decision, 2026-10-31): assessment labels are not offered on content units, nor the reverse, and the same name may exist in both. The management rules and label UI are the same in every module.

The first delivery integrates labels with assessments: assignments, quizzes and exams share the assessment catalog, and each assessment may have multiple labels. Content units are the second integration (owner request, 2026-10-31): units have their own catalog, and each unit may have multiple labels, shown on its library card, applied from its menus and filtered from the library's view options. Labels for students and other record types will be added in later deliveries. The [assessment integration](assessments.md#labels) defines the initial UI and assessment-specific behavior.

## Permissions and management

Labels are visible only to staff; students and parents cannot see or manage them. All active academy staff, including Instructors, may apply and remove existing labels on supported records. Only Owners, Head Admins and Admins may create, rename, recolor or delete label definitions.

Managers use a label editor popover for creation, renaming, color changes and deletion. Management entry points and the editor itself are hidden from Instructors. Each supported module provides the agreed integration without redefining label ownership or management permissions.

## Changes and deletion

Renaming or recoloring a label updates every use in its catalog. Deleting a label is permitted even when used and removes every association while preserving the records themselves. Labels are organizational metadata; their changes do not change the underlying record's domain data or history.

Show a confirmation dialog only when at least one record in its catalog uses the label, counting all types and years, including archived records and closed-year uses. An unused label is deleted without a confirmation dialog. Check authoritative usage at deletion so concurrent assignment cannot bypass the confirmation requirement. Deletion removes all associations atomically while preserving the labelled records, academic work and official results.

## Colors

Label colors come from the centrally defined, fixed named palette with coordinated light and dark appearances described in the [shared brand reference](../../../../docs/engineering/brand.md#reusable-color-palette). Records store stable palette keys so later palette refinements update all uses. Users choose named palette entries rather than custom colors. The same palette can support other color-coded features and academy colors in later deliveries.
