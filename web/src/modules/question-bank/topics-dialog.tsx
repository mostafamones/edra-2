import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { topicLimit } from "./review-contract";
import { cleanTopic, topicKey, unassignedTopic, type TopicAssignment, type TopicGroup } from "./topics";
import type { Question } from "./parser";

type Props = {
  groups: TopicGroup[];
  assignments: Map<string, TopicAssignment>;
  prompt: (question: Question) => string;
  apply: (ids: string[], label: string | null) => void;
  showInQueue: (key: string) => void;
  disabled: boolean;
};

export function TopicsDialog(props: Props) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={props.disabled || !props.groups.length}>
      <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.5} />Review topics
    </Button></DialogTrigger>
    <DialogContent className="max-h-[90svh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Review topics</DialogTitle>
        <DialogDescription className="sr-only">Review suggested topics and move selected questions between groups.</DialogDescription>
      </DialogHeader>
      <TopicWorkspace {...props} showInQueue={key => { props.showInQueue(key); setOpen(false); }} />
    </DialogContent>
  </Dialog>;
}

const destinationValue = (key: string) => `topic:${key}`;

function TopicWorkspace({ groups, assignments, prompt, apply, showInQueue, disabled }: Props) {
  const [activeKey, setActiveKey] = useState(() => (groups.find(group => group.pending) ?? groups[0])?.key);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [destination, setDestination] = useState("");
  const [name, setName] = useState("");
  const active = groups.find(group => group.key === activeKey) ?? groups[0];
  if (!active) return <p role="status" className="text-sm text-muted-foreground">No questions to categorize</p>;
  const ids = active.questions.filter(q => selected.has(q.id)).map(q => q.id);
  const all = ids.length === active.questions.length;
  const target = destination === "new" ? cleanTopic(name) : destination === "unassigned" ? null : groups.find(group => destinationValue(group.key) === destination)?.label;
  const existing = target ? groups.find(group => group.key === topicKey(target)) : undefined;
  const canMove = !!destination && target !== undefined && target !== "" && (existing?.key ?? (target ? topicKey(target) : unassignedTopic)) !== active.key;
  const canConfirm = active.label && ids.some(id => assignments.get(id)?.verification === "suggested");

  function choose(key: string) {
    setActiveKey(key);
    setSelected(new Set());
    setDestination("");
    setName("");
  }

  return <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
    <nav aria-label="Topics" className="max-h-36 space-y-1 overflow-auto rounded-lg border p-2 sm:max-h-[54svh]">
      {groups.map(group => <Button key={group.key} variant={group.key === active.key ? "secondary" : "ghost"} size="sm"
        aria-pressed={group.key === active.key} className="h-auto min-h-9 w-full justify-between whitespace-normal" onClick={() => choose(group.key)}>
        <span className="min-w-0 break-words text-start" dir="auto">{group.label ?? "Unassigned"}</span>
        <Badge variant="outline">{group.questions.length}</Badge>
      </Button>)}
    </nav>
    <section aria-label="Questions in topic" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold" dir="auto">{active.label ?? "Unassigned"}</h3>
        <Button size="sm" variant="ghost" onClick={() => showInQueue(active.key)}>View in queue</Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={all || (ids.length > 0 ? "indeterminate" : false)} onCheckedChange={checked => setSelected(new Set(checked ? active.questions.map(q => q.id) : []))} />Select all
        </label>
        {ids.length > 0 && <span role="status" className="text-xs text-muted-foreground">{ids.length} selected</span>}
      </div>
      <ul className="max-h-[36svh] divide-y overflow-auto rounded-lg border">
        {active.questions.map(q => <li key={q.id}>
          <label className="flex cursor-pointer items-start gap-3 p-3">
            <Checkbox className="mt-1" checked={selected.has(q.id)} aria-label={`Select question ${q.number}, page ${q.page}`} onCheckedChange={checked => setSelected(previous => {
              const next = new Set(previous);
              if (checked) next.add(q.id); else next.delete(q.id);
              return next;
            })} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Question {q.number} · Page {q.page}
                {assignments.get(q.id)?.verification === "suggested" && <Badge variant="secondary">Suggested</Badge>}
              </span>
              <span className="line-clamp-2 break-words text-sm" dir="auto">{prompt(q)}</span>
            </span>
          </label>
        </li>)}
      </ul>
      {!!ids.length && <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <Field className="min-w-36 flex-1">
          <FieldLabel htmlFor="qb-topic-destination">Move to topic</FieldLabel>
          <Select value={destination} onValueChange={setDestination} disabled={disabled}>
            <SelectTrigger id="qb-topic-destination" className="w-full"><SelectValue placeholder="Choose topic" /></SelectTrigger>
            <SelectContent>
              {groups.filter(group => group.label && group.key !== active.key).map(group =>
                <SelectItem key={group.key} value={destinationValue(group.key)}><span dir="auto">{group.label}</span></SelectItem>)}
              <SelectItem value="new">New topic</SelectItem>
              {active.key !== unassignedTopic && <SelectItem value="unassigned">Unassigned</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
        {destination === "new" && <Field className="min-w-36 flex-1"><FieldLabel htmlFor="qb-topic-name">Topic name</FieldLabel>
          <Input id="qb-topic-name" maxLength={topicLimit} dir="auto" value={name} onChange={event => setName(event.target.value)} />
        </Field>}
        <Button type="button" disabled={disabled || (destination ? !canMove : !canConfirm)} onClick={() => {
          if (canMove) {
            const label = existing?.label ?? target ?? null;
            apply(ids, label);
            choose(label ? topicKey(label) : unassignedTopic);
          } else if (canConfirm) {
            apply(ids, active.label);
            choose(active.key);
          }
        }}>{canMove || destination ? "Move questions" : "Confirm topic"}</Button>
      </div>}
    </section>
  </div>;
}
