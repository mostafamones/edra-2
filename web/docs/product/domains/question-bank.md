# Edra — question bank

Confirmed by the owner, 2026-11-22. These are approved product requirements, not a statement of implementation or deployment.

## Library and import

The staff sidebar keeps **Question bank**. Its landing page is the saved-question library. **Import PDF** opens a separate import page from the library; Import does not have a separate sidebar entry. Refine both screens around their respective tasks: browsing saved questions and importing/reviewing new questions.

The existing manager-only access remains: Owners, Head Admins and Admins can use the question bank. This change does not grant access to Instructors, students or parents.

## Collections

A question is saved once and may belong to multiple collections at the same time. Collection membership must not require copies of the question. Support four collection types:

- **Topics:** staff can assign several topics to a question.
- **Source documents:** group questions from their original source document.
- **Source sections:** belong to their source document and group questions from a section within it.
- **Custom collections:** staff-created groupings of selected questions.

Saving reviewed questions from an import automatically creates or reuses their source-document and source-section collections. Topic memberships are confirmed during review. Do not require staff to create each source collection manually before saving.

Preserve source references when staff reorganize questions. Removing an organizational membership does not delete the question or its original source evidence. Source collection identity must not rely on a filename alone, and section identity must retain its document context.

## Managing saved questions

Requested by the owner, 2026-11-26. Staff can edit a saved question's prompt, choice texts, confirmed answer and written model answer from the library, including confirming an answer by choosing it in the preview. Choice keys, source evidence, visuals and memberships do not change through an edit.

Staff can archive questions (singly or in bulk) and restore them. Archived questions leave the library, collection counts and the assessment picker but keep their content and memberships. Staff can also permanently delete questions after a confirmation. Editing, archiving or deleting a bank question never changes copies already added to assessments.

## Existing behavior to preserve

Keep saved question content, confirmed answers, optional written model answers, visuals, source page references and optional Library unit links available. The content Library and its units remain distinct from the question-bank library and collections.

The existing exam/quiz **Add from Question Bank** flow continues to add an editable copy under the assessment editor's existing rules. Collection changes do not rewrite questions already copied into assessments.

Import remains an explicit extraction, review and save workflow. Automatic source collections are created when questions are saved, rather than treating extraction as a database save. Existing extraction limits, answer review, provider consent, development-only Gemini availability and save safety remain in force.

## Implementation reference

The [question-bank module README](../../../src/modules/question-bank/README.md) describes the implemented library, collections, import page, persisted question format, assessment picker and verification evidence. The assessment picker remains a dialog selection surface over the same library reads.
