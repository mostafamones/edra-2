import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchTeamMembers, ROLE_LABELS, staffQueryKeys } from "@/modules/staff";
import type { ConcernScope } from "../queries";

export type MentionPerson = { userId: string; name: string | null; avatarUrl?: string };
const initials = (name: string | null) => (name ?? "Staff").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits text into plain parts and `@Name` tokens of the given (mentioned) people, longest name first. */
export function splitMentions(body: string, people: MentionPerson[]) {
  const named = people.filter((person) => person.name).sort((a, b) => b.name!.length - a.name!.length);
  if (!named.length) return [body];
  const pattern = new RegExp(`@(${named.map((person) => escape(person.name!)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const parts: (string | MentionPerson)[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > last) parts.push(body.slice(last, match.index));
    parts.push(named.find((person) => person.name === match[1])!);
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function Mention({ person, scope }: { person: MentionPerson; scope: ConcernScope }) {
  const [open, setOpen] = useState(false);
  const members = useQuery({ queryKey: staffQueryKeys.members(scope.userId, scope.academyId), queryFn: ({ signal }) => fetchTeamMembers(scope.academyId, signal), staleTime: 5 * 60_000, enabled: open });
  const role = members.data?.find((member) => member.user_id === person.userId)?.role;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="rounded-md bg-current/15 px-1 font-semibold hover:bg-current/25">@{person.name}</button>
    </PopoverTrigger>
    <PopoverContent className="flex w-64 items-center gap-3" align="start">
      <Avatar size="lg" aria-hidden="true"><AvatarImage src={person.avatarUrl} alt="" /><AvatarFallback>{initials(person.name)}</AvatarFallback></Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium" dir="auto">{person.name ?? "Staff"}</p>
        {role && <p className="text-sm text-muted-foreground">{ROLE_LABELS[role]}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}

/** Text stays text. Only explicit HTTP(S) URLs become links and recorded mentions become badges; no HTML or metadata is fetched. */
export function ConcernBody({ body, mentions = [], scope }: { body: string; mentions?: MentionPerson[]; scope?: ConcernScope }) {
  return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" dir="auto">{splitMentions(body, scope ? mentions : []).map((part, index) => typeof part !== "string"
    ? <Mention key={index} person={part} scope={scope!} />
    : part.split(/(https?:\/\/[^\s<>]+)/gi).map((piece, inner) => /^https?:\/\//i.test(piece)
      ? <a key={`${index}-${inner}`} href={piece} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{piece}</a> : piece))}</p>;
}
