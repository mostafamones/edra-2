# Edra web MVP

Approved by the owner, 2026-10-10.

## Purpose

Edra helps academies organize their teaching, support their students, and keep parents informed. The web MVP brings in-person and online learning together so staff, students, and parents work from the same academic record.

## Users and responsibilities

- Owner: leads the academy and holds its highest level of authority over its operations, staff, and academic direction.
- Head Admin: has the same authority as the Owner except for academy deletion and other actions reserved to the Owner.
- Admin: manages the academy’s day-to-day administration within the responsibilities assigned to the role.
- Instructor: teaches, prepares content units, marks work, and follows students’ participation and progress, within the role’s permissions.
- Student: attends the academy in person, online, or both; learns through released content units; and follows their results and progress.
- Parent or guardian: follows their child’s participation and progress through reports and academy messages.

Each staff role’s authority is defined in the permission matrix.

## Milestone outcome

By the end of this milestone, Edra will give academy staff, students, and parents a connected experience for organizing, participating in, and following learning, whether teaching happens in person or online.

Staff will be able to organize the academy, run live sessions and record attendance, build and release content units, mark work and announce results, and manage students’ learning access.

Students will be able to navigate their academies and courses, work through released content units — watching explanation videos, solving assignments and quizzes, and viewing answer videos — and follow their results, attendance and progress.

Parents will be able to follow their child’s attendance and progress through reports and academy messages.

## Pillars

These are the properties that make Edra what it is. Scope and completion criteria serve them.

1. **One academic record for in-person and online learning.** A student can attend in person before having an online account. Attendance, marks and results from the classroom and from online learning belong to the same record.
2. **Content units are the core of online learning.** A content unit holds the explanation videos, assignments, quizzes, homework and quiz answer videos, and the student’s progress through them. Releasing a content unit is what makes its learning available to students.
3. **Finalized attendance is the official record.** It drives reports, explanation access and parent communication.
4. **Announced results are the official marks.** Marks become visible and count toward performance only when announced, and corrections preserve the earlier record.
5. **Learning access is controlled.** Students reach content through earned access, coupons or staff grants, and protected video playback.
6. **Academies are isolated.** Each academy’s data and actions are reachable only by its own members, according to their role.

## Included scope

### 1. Academy setup and staff

- Account registration, verification, sign-in and recovery.
- Academy creation, staff invitations and role-based memberships.
- Academy selection for accounts that belong to more than one academy.
- Academy profile, offered levels and tracks, and academic years.

### 2. Students and online accounts

- Student records created by staff, through enrollment, or by import, with duplicate review.
- Student contact details, participation type, program and group placement, and archival.
- Student onboarding through the academy’s student invite link.

Student onboarding connects accounts automatically; staff do not link them. New students gain online academy access through the student invite. Signed-in returning students can use the academy's public booking link to continue through returning onboarding and receive access without another invite. A matching phone number alone does not grant academy access.

### 3. Live teaching and attendance

- Groups and recurring or one-off schedules.
- Starting and ending live sessions, with the expected student list.
- Attendance by manual entry or student-code check-in, including unexpected and replacement attendance.
- Recording which content was covered in a session.
- Finalizing attendance separately from ending the session, with corrections through review.

### 4. Content units and online learning

- Building content units from explanation videos, assignments, quizzes, homework answer videos and quiz answer videos.
- Releasing content units to their intended students and archiving them.
- Students navigating academies and courses to reach released content units.
- Students watching videos, solving assignments and quizzes, and resuming where they left off.
- Each student’s progress through a content unit.
- Protected video playback under the academy’s viewing rules.

Attached assignments, quizzes and exams reach online students through their content unit. An exam may follow a revision unit or be available independently under its own assessment rules.

### 5. Standalone assignments

- Assignments that exist without a content unit, either because they are used independently or because they are awaiting a content unit to be attached to.
- Attaching a standalone assignment to a content unit later, keeping the work and marks already recorded.

### 6. Marking and results

- Manual and automatic marking, including physical answer sheets.
- Exams and quizzes with exactly one online attempt and no ordinary retakes.
- Announcing results to individual students or a selected group.
- Correcting announced results while preserving the earlier record.

### 7. Learning access and coupons

- Explanation access earned through finalized attendance.
- Answer-video access earned through submission or an announced result.
- Coupon batches, printing or exporting codes, and student redemption.
- Staff grants and revocations, access extensions, expiry and suspension.

### 8. Reports and parent communication

- Staff overview and calendar of teaching activity and pending work.
- Student and academy attendance and performance summaries.
- Parent report links that staff create, preview, replace and revoke.
- Parent reports covering finalized attendance, announced results and visible notes.
- Academic notifications to parents through WhatsApp.

## Completion criteria

The web MVP is complete when the following experiences work together:

1. An Owner sets up an academy, invites staff, and each role reaches only the academy data and actions it is permitted.
2. Staff create, enroll or import students and place them in groups. A student joins through the student invite link, and onboarding links their account to their academy record automatically.
3. Staff run a session and finalize attendance. Explanation access, reports and parent messages follow the finalized record.
4. Staff build a content unit with its explanation videos, assignments, quizzes and answer videos, and release it to its students.
5. Staff keep standalone assignments for independent use or until a content unit is ready, and attach them later without losing recorded work.
6. Staff mark in-person and online work and announce results.
7. A student navigates their academies and courses, works through released content units, submits work, and follows their results, attendance and progress.
8. A parent follows their child’s attendance and progress through reports and WhatsApp messages.

## Architecture and application boundaries

The web application provides the staff and student browser experiences, parent reports, and the academy services used by native applications. Architecture, API contracts and implementation constraints are documented in the engineering references.

## Related mobile milestones

Edra’s mobile roadmap covers the iOS instructor companion, further instructor features, native Android support and a student portal. Mobile milestone documents define those experiences.

## Outside this web milestone

- Native application releases.
- Tuition collection, payment processing and student-paid subscriptions.
- Custom role builders, school-level systems and university management.
- General chat, social features and mass broadcasts.
- Parent accounts or a parent application.
- Camera monitoring and device management.

## Delivery tracking

Linear tracks milestone targets and delivery work. This document defines the milestone’s outcome and scope; domain documents define detailed product rules.
