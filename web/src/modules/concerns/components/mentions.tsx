import { AtIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Extension, mergeAttributes, type Editor, type JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Mention from "@tiptap/extension-mention";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONCERN_BODY_MAX } from "../validation";
import { splitMentions } from "./body";

export type MentionChoice = { userId: string; name: string | null };
const label = (choice: MentionChoice) => choice.name ?? "Staff";
export const MENTION_CHIP = "rounded-md bg-primary/15 px-1 py-px font-medium text-primary";

/** The plain-text body a message stores: mentions as `@Name`, line breaks as `\n`. */
export const editorText = (editor: Editor) => editor.getText({ blockSeparator: "\n" });

/** Rebuilds editor content from a stored body, turning `@Name` of known people back into chips. */
export function editorContent(text: string, people: MentionChoice[]): JSONContent {
  const content: JSONContent[] = [];
  text.split("\n").forEach((line, index) => {
    if (index) content.push({ type: "hardBreak" });
    for (const part of splitMentions(line, people)) {
      if (typeof part !== "string") content.push({ type: "mention", attrs: { id: part.userId, label: label(part) } });
      else if (part) content.push({ type: "text", text: part });
    }
  });
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

type Suggest = { items: MentionChoice[]; command: (attrs: { id: string; label: string }) => void };

type Latest = { participants: MentionChoice[]; onChange: (value: string) => void; onMention: (choice: MentionChoice) => void; onBlur?: () => void; suggest: Suggest | null; active: number };
type Handles = { latest: RefObject<Latest | null>; anchor: RefObject<{ getBoundingClientRect: () => DOMRect }>; setSuggest: (value: Suggest | null) => void; setActive: (value: number | ((index: number) => number)) => void; pick: (choice: MentionChoice) => void };

/** Plain-text editing with mention chips; the suggestion list is rendered by the component through `setSuggest`. */
function messageExtensions({ latest, anchor, setSuggest, setActive, pick }: Handles) {
  return [Document, Paragraph, Text, HardBreak, UndoRedo,
    Mention.configure({
      deleteTriggerWithBackspace: true,
      renderText: ({ node }) => `@${node.attrs.label}`,
      renderHTML: ({ node }) => ["span", mergeAttributes({ "data-type": "mention", class: MENTION_CHIP }), `@${node.attrs.label}`],
      suggestion: {
        items: ({ query }) => latest.current!.participants.filter((choice) => label(choice).toLowerCase().includes(query.toLowerCase())),
        render: () => {
          const show = (props: { items: MentionChoice[]; command: Suggest["command"]; clientRect?: (() => DOMRect | null) | null }) => {
            anchor.current = { getBoundingClientRect: () => props.clientRect?.() ?? new DOMRect() };
            setSuggest({ items: props.items, command: props.command });
          };
          return {
            onStart: (props) => { setActive(0); show(props); },
            onUpdate: (props) => { setActive(0); show(props); },
            onExit: () => setSuggest(null),
            onKeyDown: ({ event }) => {
              const { suggest: open, active: index } = latest.current!;
              if (!open) return false;
              if (event.key === "Escape") { setSuggest(null); return true; }
              if (!open.items.length) return false;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { setActive((index + (event.key === "ArrowDown" ? 1 : open.items.length - 1)) % open.items.length); return true; }
              if (event.key === "Enter" || event.key === "Tab") { pick(open.items[Math.min(index, open.items.length - 1)]); return true; }
              return false;
            },
          };
        },
      },
    }),
    Extension.create({
      name: "sendOnEnter",
      addKeyboardShortcuts: () => ({ Enter: ({ editor: current }) => { current.view.dom.closest("form")?.requestSubmit(); return true; } }),
    }),
  ];
}

/**
 * Rich chat box inside a form: mentions are chips, Enter submits the form, Shift+Enter breaks the
 * line, and typing `@` (or the @ button) opens the participant list at the caret. `children`
 * render inline beside the @ button (send, attach…). The value stays plain text.
 */
export function ConcernMessageInput({ id, label: ariaLabel, value, onChange, participants, onMention, onBlur, disabled, inputRef, children }: {
  id: string; label: string; value: string; onChange: (value: string) => void; participants: MentionChoice[];
  onMention: (choice: MentionChoice) => void; onBlur?: () => void; disabled?: boolean;
  inputRef?: RefObject<HTMLElement | null>; children?: ReactNode;
}) {
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [active, setActive] = useState(0);
  const anchor = useRef({ getBoundingClientRect: () => new DOMRect() });
  const latest = useRef<Latest | null>(null);
  useLayoutEffect(() => { latest.current = { participants, onChange, onMention, onBlur, suggest, active }; });

  const pick = (choice: MentionChoice) => {
    latest.current?.suggest?.command({ id: choice.userId, label: label(choice) });
    latest.current?.onMention(choice);
  };

  const editor = useEditor({
    immediatelyRender: false,
    // Built once; the refs are only read inside editor callbacks, never while rendering.
    // eslint-disable-next-line react-hooks/refs
    extensions: messageExtensions({ latest, anchor, setSuggest, setActive, pick }),
    content: editorContent(value, participants),
    editable: !disabled,
    editorProps: {
      attributes: { id, role: "textbox", "aria-label": ariaLabel, "aria-multiline": "true", "data-slot": "input-group-control",
        class: "max-h-40 min-h-11 w-full overflow-y-auto px-3 py-2.5 text-sm break-words whitespace-pre-wrap outline-none" },
      // Plain text only: pasted formatting would be lost on save anyway.
      transformPastedHTML: (html) => new DOMParser().parseFromString(html, "text/html").body.textContent ?? "",
    },
    onUpdate: ({ editor: current }) => {
      const text = editorText(current);
      if (text.length > CONCERN_BODY_MAX) { current.commands.undo(); return; }
      latest.current?.onChange(text);
    },
    onBlur: () => latest.current?.onBlur?.(),
  });

  // The parent clears or replaces the text (after a send, or when editing starts).
  useEffect(() => {
    if (editor && value !== editorText(editor)) editor.commands.setContent(editorContent(value, latest.current?.participants ?? []), { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => { if (inputRef && editor) inputRef.current = editor.view.dom; }, [editor, inputRef]);

  function startMention() {
    if (!editor) return;
    editor.commands.focus(editor.isFocused ? undefined : "end");
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, "\n", " ");
    editor.commands.insertContent({ type: "text", text: before && !/\s/.test(before) ? " @" : "@" });
  }

  return <Popover open={!!suggest && !disabled} onOpenChange={(next) => { if (!next) setSuggest(null); }}>
    <PopoverAnchor virtualRef={anchor} />
    <InputGroup data-disabled={disabled || undefined} className="h-auto border-input bg-background focus-within:border-ring has-[[data-slot=input-group-control]:focus-visible]:bg-background">
      <EditorContent editor={editor} className="w-full min-w-0" />
      <InputGroupAddon align="block-end">
        <Tooltip><TooltipTrigger asChild>
          <InputGroupButton size="icon-sm" aria-label="Mention participant" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={startMention}><HugeiconsIcon icon={AtIcon} strokeWidth={1.5} aria-hidden="true" /></InputGroupButton>
        </TooltipTrigger><TooltipContent>Mention</TooltipContent></Tooltip>
        {children}
      </InputGroupAddon>
    </InputGroup>
    <PopoverContent side="top" align="start" className="w-64 p-1" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}
      onInteractOutside={(event) => { if (editor?.view.dom.contains(event.target as Node)) event.preventDefault(); }}>
      <Command shouldFilter={false} value={suggest?.items[active]?.userId ?? ""} label="Participants">
        <CommandList><CommandEmpty>No matching participants</CommandEmpty>
          {suggest?.items.map((choice) => <CommandItem key={choice.userId} value={choice.userId} onMouseDown={(event) => event.preventDefault()} onSelect={() => pick(choice)}>
            <span className="truncate" dir="auto">{label(choice)}</span>
          </CommandItem>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

export function mentionIds(body: string, selected: MentionChoice[]) {
  return selected.filter((participant) => body.includes(`@${label(participant)}`)).map((participant) => participant.userId);
}
