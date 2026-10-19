"use client";

import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { imageIds, imageToken, MAX_QUESTION_IMAGES, splitImages } from "./tokens";
import { ImageBadge } from "./badge";
import { useImages } from "./context";
import { ImageViewer } from "./viewer";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Question text wraps and takes line breaks; a choice is a single line. */
  multiline?: boolean;
  /** Images this field may still add (the cap covers a question's text and choices together). */
  room: number;
  readOnly?: boolean;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  className?: string;
};

/**
 * Rendered after every badge and never stored: browsers cannot place the caret after a non-editable
 * element that ends the field or sits beside another one.
 */
const SPACER = "\u200B";
const visible = (text: string) => text.replaceAll(SPACER, "");

/** The field's content as stored: text with each image badge written back as its token. */
function serialize(root: Node): string {
  let out = "";
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += visible(node.textContent ?? "");
    else if (node instanceof HTMLElement) {
      if (node.dataset.imageId) out += imageToken(node.dataset.imageId);
      else if (node.tagName === "BR") out += "\n";
      else {
        // Browsers may wrap new lines in blocks.
        if (node.tagName === "DIV" && out !== "" && !out.endsWith("\n")) out += "\n";
        out += serialize(node);
      }
    }
  });
  return out;
}

/** The caret position as an offset into the stored value. */
function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.setStart(root, 0);
  return serialize(range.cloneContents()).length;
}

/** The DOM offset in a text node of its n-th stored character, past any spacer. */
function textOffset(text: string, n: number) {
  let index = 0;
  for (let count = 0; index < text.length; index++) {
    if (text[index] === SPACER) continue;
    if (count === n) break;
    count++;
  }
  return index;
}

/** Places the caret at an offset into the stored value of a freshly rendered field. */
function placeCaret(root: HTMLElement, offset: number) {
  const range = document.createRange();
  let remaining = offset;
  range.selectNodeContents(root);
  range.collapse(false);
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (remaining <= visible(text).length) {
        range.setStart(node, textOffset(text, remaining));
        range.collapse(true);
        break;
      }
      remaining -= visible(text).length;
    } else if (node instanceof HTMLElement && node.dataset.imageId) {
      // Landing just after a badge falls through to the spacer text that follows it.
      remaining -= imageToken(node.dataset.imageId).length;
      if (remaining < 0) {
        range.setStartAfter(node);
        range.collapse(true);
        break;
      }
    }
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * A text field that accepts pasted images as inline badges. Hovering a badge previews the image;
 * clicking opens the viewer. Typing edits the DOM directly; the content is re-rendered only when the
 * value changes from outside or an image is added or removed.
 */
export function ImageTextField({ value, onChange, onBlur, multiline = false, room, readOnly = false, id, placeholder, className, ...aria }: Props) {
  const { upload } = useImages();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState({ source: value, version: 0 });
  // The value the DOM currently holds; a different incoming value came from outside.
  const [current, setCurrent] = useState(value);
  const [viewing, setViewing] = useState<number | null>(null);
  const caret = useRef<number | null>(null);
  const latest = useRef(value);

  if (value !== current) {
    setCurrent(value);
    setShown((state) => ({ source: value, version: state.version + 1 }));
  }

  useLayoutEffect(() => { latest.current = value; }, [value]);
  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    ref.current.focus();
    placeCaret(ref.current, caret.current);
    caret.current = null;
  }, [shown.version]);

  /** Re-renders the field with new content (an image added or removed), keeping the caret if given. */
  function replace(next: string, caretAt: number | null = null) {
    caret.current = caretAt;
    latest.current = next;
    setCurrent(next);
    setShown((state) => ({ source: next, version: state.version + 1 }));
    onChange(next);
  }

  function input() {
    if (!ref.current) return;
    const next = serialize(ref.current);
    // A badge deleted from the keyboard: re-render so the remaining badges renumber.
    if (imageIds(next).join() !== imageIds(shown.source).join()) return replace(next, caretOffset(ref.current));
    latest.current = next;
    setCurrent(next);
    onChange(next);
  }

  function remove(imageId: string) {
    replace(latest.current.replace(imageToken(imageId), ""));
  }

  function addImages(files: File[]) {
    const root = ref.current;
    if (!root) return;
    if (files.length > room) toast.error(`A question can have up to ${MAX_QUESTION_IMAGES} images across its text and choices.`);
    const uploads = files.slice(0, Math.max(room, 0)).map(upload).filter((entry) => entry !== null);
    if (uploads.length === 0) return;
    const text = serialize(root);
    const at = caretOffset(root) ?? text.length;
    const tokens = uploads.map((entry) => imageToken(entry.id)).join("");
    replace(text.slice(0, at) + tokens + text.slice(at), at + tokens.length);
    // A failed upload leaves nothing to save: drop its badge.
    uploads.forEach((entry) => void entry.done.then((ok) => { if (!ok) remove(entry.id); }));
  }

  /** Backspace right after a badge removes it in one press rather than first eating the spacer. */
  function removeBadgeBefore() {
    const root = ref.current;
    const selection = window.getSelection();
    if (!root || !selection?.isCollapsed || !selection.anchorNode) return false;
    const { anchorNode: node, anchorOffset: offset } = selection;
    if (node.nodeType !== Node.TEXT_NODE || !root.contains(node) || visible((node.textContent ?? "").slice(0, offset)) !== "") return false;
    let badge = node.previousSibling;
    while (badge?.nodeType === Node.TEXT_NODE && visible(badge.textContent ?? "") === "") badge = badge.previousSibling;
    if (!(badge instanceof HTMLElement) || !badge.dataset.imageId) return false;
    const at = caretOffset(root);
    const token = imageToken(badge.dataset.imageId);
    if (at === null) return false;
    replace(latest.current.replace(token, ""), at - token.length);
    return true;
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (files.length > 0) return addImages(files);
    const text = event.clipboardData.getData("text/plain");
    // Plain text only, inserted through the editing pipeline so undo keeps working.
    document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\r?\n\s*/g, " "));
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Backspace" && removeBadgeBefore()) return event.preventDefault();
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (multiline) document.execCommand("insertLineBreak");
  }

  const ids = imageIds(current);
  const segments = splitImages(shown.source);
  return (
    <div className="relative w-full">
      <div key={shown.version} ref={ref} id={id} role="textbox" aria-multiline={multiline} aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]} aria-placeholder={placeholder} aria-readonly={readOnly || undefined} contentEditable={!readOnly} suppressContentEditableWarning
        onInput={input} onPaste={readOnly ? (event) => event.preventDefault() : paste} onKeyDown={readOnly ? undefined : keyDown} onBlur={onBlur} onDrop={(event) => event.preventDefault()}
        className={cn(
          "w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          multiline ? "min-h-16 py-2 break-words whitespace-pre-wrap" : "flex h-9 items-center overflow-x-auto py-1 whitespace-pre [scrollbar-width:none]",
          className,
        )}>
        {segments.map((segment, index) => {
          if (segment.type === "text") return segment.text;
          const position = segments.slice(0, index).filter((entry) => entry.type === "image").length;
          return [
            <ImageBadge key={`${segment.id}-${index}`} id={segment.id} number={position + 1} onOpen={() => setViewing(position)} />,
            SPACER,
          ];
        })}
      </div>
      {current === "" && placeholder && (
        <span aria-hidden="true" className={cn("pointer-events-none absolute left-2.5 text-base text-muted-foreground md:text-sm", multiline ? "top-2" : "top-1/2 -translate-y-1/2")}>
          {placeholder}
        </span>
      )}
      <ImageViewer ids={ids} index={viewing} onIndexChange={setViewing} onRemove={readOnly ? undefined : (imageId) => { remove(imageId); if (ids.length <= 1) setViewing(null); }} />
    </div>
  );
}
