/**
 * Images pasted into question text and choices, in assignments, quizzes and exams. A field stores each image inline as the token
 * `{{image:<id>}}`; the file lives in the private `assignment-images` bucket at `<academyId>/<id>`.
 * The database checks the references and the per-question cap (migrations 20261007140000 and
 * 20261017120000).
 */

export const IMAGE_BUCKET = "assignment-images";
export const MAX_QUESTION_IMAGES = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const TOKEN = /\{\{image:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}/g;

export type TextSegment = { type: "text"; text: string } | { type: "image"; id: string };

export const imageToken = (id: string) => `{{image:${id}}}`;
export const imagePath = (academyId: string, id: string) => `${academyId}/${id}`;

/** The image ids referenced by a text, in order. */
export const imageIds = (text: string) => [...text.matchAll(TOKEN)].map((match) => match[1]);

/** A text as runs of plain text and images. */
export function splitImages(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let from = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > from) segments.push({ type: "text", text: text.slice(from, match.index) });
    segments.push({ type: "image", id: match[1] });
    from = match.index + match[0].length;
  }
  if (from < text.length) segments.push({ type: "text", text: text.slice(from) });
  return segments;
}

/** Images referenced by a question's text and choices together; the cap covers both. */
export const questionImageCount = (question: { prompt: string; choices: readonly { label: string }[] }) =>
  imageIds(question.prompt).length + question.choices.reduce((sum, choice) => sum + imageIds(choice.label).length, 0);

/** Text with each image written as "[image]", for places that show plain text only. */
export const plainText = (text: string) => text.replace(TOKEN, "[image]");
