"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/modules/auth";
import { StartSessionCommand } from "@/modules/sessions";
import { validAcademySlug, studentAcademyPath } from "@/lib/routing";
import { commandEntries, filteredCommands, type CommandEntry } from "./catalog";
import { searchAcademy } from "./actions";
import { commandShortcut, slashOpensSearch } from "./types";
import { commandIcon, recordIcon } from "./icons";

type Props = { platform: "staff" | "student"; academies?: { name: string; slug: string }[]; className?: string };
export function SearchMenu(props: Props) {
  const { user, activeAcademy, loading } = useAuth();
  const pathname = usePathname();
  const candidate = pathname.split("/")[1];
  const slug = props.platform === "staff" ? activeAcademy?.slug : props.academies?.find(item => item.slug === candidate)?.slug;
  return <Menu key={`${user?.id}:${props.platform}:${activeAcademy?.id}:${activeAcademy?.role}:${slug}:${pathname}`} {...props} slug={slug} disabled={loading || !user} />;
}

function Menu({ platform, academies = [], slug, disabled, className }: Props & { slug?: string; disabled: boolean }) {
  const { user, activeAcademy } = useAuth();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [debounced, setDebounced] = useState("");
  const [command, setCommand] = useState<CommandEntry["command"]>();
  const [busy, setBusy] = useState(false);
  const commandRef = useRef<{ back: () => void }>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const text = search.trim();
  useEffect(() => { const timer = setTimeout(() => setDebounced(text), 250); return () => clearTimeout(timer); }, [text]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (disabled) return;
      if (commandShortcut(event)) {
        event.preventDefault();
        if (!busy) { setOpen(value => !value); setSearch(""); setCommand(undefined); }
      } else if (slashOpensSearch(event, event.target)) { event.preventDefault(); setOpen(true); }
    }
    window.addEventListener("keydown", shortcut, true); return () => window.removeEventListener("keydown", shortcut, true);
  }, [disabled, busy]);
  const records = useQuery({ queryKey: ["command-search", user?.id, platform, slug, debounced],
    enabled: open && !command && !disabled && !!slug && validAcademySlug(slug) && debounced.length >= 2,
    gcTime: 0, staleTime: 0, retry: false, refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await searchAcademy({ platform, slug, query: debounced });
      if (!result.ok) throw new Error(result.message);
      if (result.value.userId !== user?.id || (platform === "staff" && result.value.academyId !== activeAcademy?.id)) throw new Error("Your account changed. Reopen search.");
      return result.value;
    },
  });
  const commands = filteredCommands(commandEntries(platform, slug, activeAcademy?.role ?? null), text);
  const academyEntries: CommandEntry[] = platform === "student" ? academies.filter(a => a.name.toLowerCase().includes(text.toLowerCase()))
    .map(a => ({ title: a.name, href: studentAcademyPath(a.slug), group: "Academies" })) : [];
  const current = text === debounced;
  const groups = current && text.length >= 2 && !records.isFetching && !records.isError ? records.data?.groups.filter(group => group.records.length) ?? [] : [];
  const searching = !!slug && text.length >= 2 && (!current || records.isFetching);
  function choose(href: string) { setOpen(false); setSearch(""); setOpenMobile(false); router.push(href); }
  function chooseCommand(item: CommandEntry) {
    if (item.command === "start-session" && platform === "staff" && activeAcademy) setCommand(item.command);
    else choose(item.href);
  }
  return <><Button type="button" variant="outline" size="sm" aria-label="Search and commands" disabled={disabled} onClick={() => setOpen(true)}
    className={`min-w-0 flex-1 justify-start pr-1.75 text-muted-foreground ${className ?? ""}`}>
    <HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} className="size-4 shrink-0" /><span className="truncate font-normal">Search</span><Kbd className="ml-auto h-4 min-w-4 bg-foreground/10 text-[10px]" aria-label="Command K or Control K">⌘ K</Kbd>
  </Button><Dialog open={open} onOpenChange={value => { if (busy) return; setOpen(value); if (!value) { setSearch(""); setCommand(undefined); } }}>
    <DialogContent aria-describedby={undefined} showCloseButton={false} onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus(); }} onEscapeKeyDown={event => { if (busy || command) { event.preventDefault(); if (!busy) commandRef.current?.back(); } }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }} className="top-[12%] max-h-[80dvh] translate-y-0 gap-3 overflow-hidden p-0 sm:max-w-xl">
      {!busy && <DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label="Close" className="absolute top-3 right-3 text-muted-foreground"><HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} className="size-4" /></Button></DialogClose>}
      <DialogHeader className="px-4 pt-4"><DialogTitle>{command ? "Start session" : "Search"}</DialogTitle><span className="text-xs text-muted-foreground">{(!command && records.data?.scope) || (slug ? activeAcademy?.name ?? academies.find(a => a.slug === slug)?.name : "Pages and commands")}</span></DialogHeader>
      {command === "start-session" && activeAcademy ? <StartSessionCommand ref={commandRef} academyId={activeAcademy.id} onBack={() => setCommand(undefined)} onBusyChange={setBusy} onComplete={() => { setOpen(false); setSearch(""); setOpenMobile(false); setCommand(undefined); }} /> : <Command shouldFilter={false} label="Search Edra" className="rounded-t-none!">
        <CommandInput ref={inputRef} autoFocus aria-label="Search Edra" placeholder="Search" value={search} maxLength={100} onValueChange={setSearch} />
        <CommandList className="max-h-[55dvh]">
          {searching && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
          {current && text.length >= 2 && records.isError && <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span>{records.error.message}</span><Button variant="ghost" size="sm" onClick={() => void records.refetch()}>Retry</Button></div>}
          {[...new Set([...(text && commands[0] ? [commands[0].group] : []), "Actions", "Pages", "Academies"])].map(label => {
            const entries = [...commands, ...academyEntries].filter(item => item.group === label).slice(0, text ? 12 : 8);
            return entries.length ? <CommandGroup key={label} heading={label}>{entries.map(item => <CommandItem key={item.href} value={item.href} onSelect={() => chooseCommand(item)} className="min-h-11 cursor-pointer gap-3 px-3">
              <HugeiconsIcon icon={commandIcon(item.icon)} strokeWidth={1.5} className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{item.title}</span>
              <CommandShortcut className={`shrink-0 tracking-normal ${item.command ? "" : "opacity-0 group-data-selected/command-item:opacity-100"}`}>{item.command ? <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-3.5" /> : "↵"}</CommandShortcut>
            </CommandItem>)}</CommandGroup> : null;
          })}
          {groups.map(group => <CommandGroup key={group.label} heading={group.label}>{group.records.map(record => <CommandItem key={`${group.label}:${record.id}`} value={`${group.label}:${record.id}`} onSelect={() => choose(`/${slug}/${record.path}`)} className="min-h-14 cursor-pointer gap-3 px-3">
            <HugeiconsIcon icon={recordIcon(group.label)} strokeWidth={1.5} className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p dir="auto" className="truncate font-medium">{record.title}</p><p dir="auto" className="truncate text-xs text-muted-foreground">{record.detail}</p></div><CommandShortcut className="tracking-normal opacity-0 group-data-selected/command-item:opacity-100">↵</CommandShortcut>
          </CommandItem>)}</CommandGroup>)}
          {!searching && !groups.length && !commands.length && !academyEntries.length && !records.isError && !records.data?.unavailable.length && <p role="status" className="px-4 py-8 text-center text-sm text-muted-foreground">No results</p>}
          {current && text.length >= 2 && !!records.data?.unavailable.length && <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span>{records.data.unavailable.join(", ")} unavailable</span><Button variant="ghost" size="sm" onClick={() => void records.refetch()}>Retry</Button></div>}
        </CommandList>
        <div className="flex items-center justify-end gap-4 border-t px-3 py-2 text-xs text-muted-foreground"><span><Kbd>↵</Kbd> Open</span><span><Kbd>Esc</Kbd> Close</span></div>
      </Command>}
    </DialogContent>
  </Dialog></>;
}
