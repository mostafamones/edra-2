import { act } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { editorText } from "./mentions";

// jsdom has no layout; ProseMirror asks for caret rectangles.
for (const proto of [Range.prototype, Element.prototype] as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
  proto.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
  proto.getBoundingClientRect ??= () => new DOMRect();
}

/** Test-only access to the rich message box (Tiptap puts its editor on the contenteditable element). */
const editorOf = (element: HTMLElement) => (element as HTMLElement & { editor: Editor }).editor;
export function typeMessage(element: HTMLElement, text: string) {
  act(() => { editorOf(element).commands.setContent(text ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } : "", { emitUpdate: true }); });
}
export const messageText = (element: HTMLElement) => editorText(editorOf(element));
export const messageLocked = (element: HTMLElement) => element.getAttribute("contenteditable") === "false";
