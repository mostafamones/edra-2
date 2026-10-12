# Edra — student imports

Approved by the owner, 2026-10-10. Detailed follow-ups remain in the separate planning review notes.

## Purpose and permissions

Imports let academy staff create student records from an existing list instead of entering each student separately.

Owners, Head Admins and Admins may import students and view completed import history. Instructors do not import students. An import belongs to one academy and its active academic year.

## Supported files

Staff can use CSV, JSON or Excel files. Templates show the required fields and examples using the academy’s offered levels, tracks and current groups, including students without a group.

Template examples contain sample names and masked phone numbers, not real student records. Staff replace or remove them before importing.

## Preparing the import

The importer selects a file and reviews how its columns map to student fields. English and Arabic column names are supported. Missing or unmatched fields are shown for review.

The importer may supply defaults for placement or participation. Explicit row values take precedence, and defaults apply only where compatible. An explicitly unassigned group remains unassigned.

Rows must meet the same required contact and placement rules as staff-created records. Importing does not bypass phone validation or the academy’s offerings.

## Duplicates

A student phone already present in the academy’s target year is skipped, including when its record is archived. The import does not overwrite or restore that record.

When several rows in the file use the same student phone, none of those rows is chosen automatically. The importer corrects or excludes them so that the intended entry can become eligible.

Shared parent phones and duplicate names are permitted. They do not by themselves cause an import row to be treated as the same student.

## Reviewing and confirming

Before confirmation, the preview distinguishes eligible entries, invalid entries, existing-record duplicates, duplicates within the file and excluded entries.

The importer can correct invalid entries or exclude entries they do not want to create. These changes affect the import draft, not existing academy records or the original file.

Confirmation creates only the eligible entries shown in the reviewed preview. Other entries remain accounted for as skipped or excluded. If changes to student records or academy structure alter the outcome, staff review the updated preview before confirming again.

## Processing and outcomes

Confirmed entries are processed in batches. Created records remain saved as processing progresses; an import may create some records and report other entries as skipped or failed.

Retries retain the outcomes of already processed entries. An interrupted import can resume without creating those students twice. If the academic year closes, further creation stops and the results already recorded remain available.

The result shows how many records were created, skipped or failed, with the relevant entry-level details.

## Drafts and history

Only the original importer may resume or change their unfinished import, while they still hold the required permission. An unconfirmed import may be discarded without creating student records.

Completed import history records the import number, original staff member, completion date and outcomes. It remains readable after the academic year closes. Unfinished drafts are available for recovery separately from completed history.

## Scope boundaries

The MVP import creates new student records. It does not update existing records, merge student profiles, connect online accounts or provide bulk returning-student enrollment.

Returning students use the reviewed returning-student flow so their academy identity and history are reused. An import must not be used to create a second identity for a known returning student.

Import limits and parsing requirements belong to the technical reference. Group capacity and enrollment rules are reviewed separately from file import.
