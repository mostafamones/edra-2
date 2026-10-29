# Edra — labels

Confirmed by the owner, 2026-10-29. These are approved requirements, not a statement of implementation or deployment.

## Shared feature and initial scope

Labels are a shared academy feature intended for use across multiple modules. Each academy has one shared label catalog, retained across academic years. Label definitions and their management are independent of the module using them.

The first delivery integrates labels with assessments: assignments, quizzes and exams share the academy's catalog, and each assessment may have multiple labels. Labels for students and other record types will be added in later deliveries; those integrations are not part of the initial implementation. The [assessment integration](assessments.md#labels) defines the initial UI and assessment-specific behavior.

## Permissions and management

Labels are visible only to staff; students and parents cannot see or manage them. All active academy staff, including Instructors, may apply and remove existing labels on supported records. Only Owners, Head Admins and Admins may create, rename, recolor or delete label definitions.

Managers use a label editor popover for creation, renaming, color changes and deletion. Management entry points and the editor itself are hidden from Instructors. Each supported module provides the agreed integration without redefining label ownership or management permissions.

## Changes and deletion

Renaming or recoloring a label updates every use. Deleting a label is permitted even when used and removes every association while preserving the records themselves. Labels are organizational metadata; their changes do not change the underlying record's domain data or history.

In the first delivery, show a confirmation dialog only when at least one assessment uses the label, counting all assessment types and years, including archived assessments and closed-year uses. An unused label is deleted without a confirmation dialog. Check authoritative usage at deletion so concurrent assignment cannot bypass the confirmation requirement. Deletion removes all associations atomically while preserving assessments, academic work and official results.

## Colors

Label colors come from the centrally defined, fixed named palette with coordinated light and dark appearances described in the [shared brand reference](../../../../docs/engineering/brand.md#reusable-color-palette). Records store stable palette keys so later palette refinements update all uses. Users choose named palette entries rather than custom colors. The same palette can support other color-coded features and academy colors in later deliveries.
