import { AtIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONCERN_BODY_MAX } from "../validation";

export type MentionChoice = { userId: string; name: string | null };
const label = (choice: MentionChoice) => choice.name ?? "Staff";

/** The `@query` being typed right before the caret, if any. */
export function mentionQuery(text: string, caret: number) {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, query: match[1] } : null;
}

/**
 * Chat text box inside a form: Enter submits it, Shift+Enter breaks the line, typing `@` (or the @ button) opens the
 * participant list at the caret. `children` render inline beside the @ button (send, attach…).
 */
export function ConcernMessageInput({ id, label: ariaLabel, value, onChange, participants, onMention, onBlur, disabled, inputRef, children }: {
  id: string; label: string; value: string; onChange: (value: string) => void; participants: MentionChoice[];
  onMention: (choice: MentionChoice) => void; onBlur?: () => void; disabled?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>; children?: ReactNode;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const input = inputRef ?? own;
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const matches = mention ? participants.filter((choice) => label(choice).toLowerCase().includes(mention.query.toLowerCase())) : [];
  const open = mention !== null && !disabled;

  const track = (text: string, caret: number) => { setMention(mentionQuery(text, caret)); setActive(0); };
  function pick(choice: MentionChoice) {
    const element = input.current;
    if (!mention || !element) return;
    const caret = element.selectionStart ?? value.length;
    const inserted = `@${label(choice)} `;
    onChange(value.slice(0, mention.start) + inserted + value.slice(caret));
    onMention(choice);
    setMention(null);
    const next = mention.start + inserted.length;
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(next, next); });
  }
  function startMention() {
    const element = input.current;
    const caret = element?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const prefix = before && !/\s$/.test(before) ? " @" : "@";
    const text = before + prefix + value.slice(caret);
    onChange(text);
    const next = caret + prefix.length;
    track(text, next);
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(next, next); });
  }

  return <Popover open={open} onOpenChange={(next) => { if (!next) setMention(null); }}>
    <PopoverAnchor asChild>
      <InputGroup data-disabled={disabled || undefined} className="bg-background has-[[data-slot=input-group-control]:focus-visible]:bg-background border-input">
        <InputGroupTextarea ref={input} id={id} aria-label={ariaLabel} value={value} maxLength={CONCERN_BODY_MAX} disabled={disabled} rows={1}
          aria-autocomplete="list" aria-expanded={open} className="max-h-40 min-h-11 resize-none overflow-y-auto"
          onChange={(event) => { onChange(event.target.value); track(event.target.value, event.target.selectionStart); }}
          onBlur={onBlur}
          onSelect={(event) => { if (mention) track(event.currentTarget.value, event.currentTarget.selectionStart); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (open && matches.length) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length); return; }
              if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); pick(matches[Math.min(active, matches.length - 1)]); return; }
            }
            if (open && event.key === "Escape") { event.preventDefault(); setMention(null); return; }
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
          }} />
        <InputGroupAddon align="block-end">
          <Tooltip><TooltipTrigger asChild>
            <InputGroupButton size="icon-sm" aria-label="Mention participant" disabled={disabled} onClick={startMention}><HugeiconsIcon icon={AtIcon} strokeWidth={1.5} aria-hidden="true" /></InputGroupButton>
          </TooltipTrigger><TooltipContent>Mention</TooltipContent></Tooltip>
          {children}
        </InputGroupAddon>
      </InputGroup>
    </PopoverAnchor>
    <PopoverContent side="top" align="start" className="w-64 p-0" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}
      onInteractOutside={(event) => { if (input.current?.closest("[data-slot=input-group]")?.contains(event.target as Node)) event.preventDefault(); }}>
      <Command shouldFilter={false} value={matches[active] ? matches[active].userId : ""} label="Participants">
        <CommandList><CommandEmpty>No matching participants</CommandEmpty>
          {matches.map((choice) => <CommandItem key={choice.userId} value={choice.userId} onMouseDown={(event) => event.preventDefault()} onSelect={() => pick(choice)}>
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
