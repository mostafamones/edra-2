"use client";

import { useCallback, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Copy01Icon, LinkSquare02Icon, Loading03Icon, Tick02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { SettingsGroup } from "@/components/shared/settings-group";
import { SettingsRow as Row } from "@/components/shared/settings-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FloatingSheet, FloatingSheetContent, FloatingSheetHeader, FloatingSheetTitle, FloatingSheetTrigger } from "@/components/ui/floating-sheet";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AcademyEntry } from "@/modules/academies";
import { copyInvitationLink } from "@/modules/staff";

import { getStudentBookingSettings, saveStudentBookingSettings } from "../actions";
import type { BookingCatalog, BookingConfiguration, BookingSettings, ParticipationMode } from "../types";
import { previewPrograms } from "../validation";
import { GroupSchedule } from "../../enrollment/components/group-schedule";
import { BookingFormPreview } from "./form";

const MODES: Record<ParticipationMode, string> = { in_person: "In person", online_only: "Online only", choice: "Student chooses" };

const SAVE_ERRORS: Record<string, string> = {
  forbidden: "You don’t have permission to do that.",
  stale: "These settings were changed by someone else. The latest version is shown.",
  no_options: "Enable at least one level or track with a group, or allow registration without a group.",
  year_unavailable: "The academic year changed. The latest settings are shown.",
};

type Draft = Omit<BookingConfiguration, "revision">;
type ChoiceField = "excludedLevelIds" | "excludedTrackIds" | "excludedGroupIds";

/** Booking form settings: managers edit and save atomically; every staff role can copy the link and preview. */
export function BookingSettingsPanel({ academy }: { academy: AcademyEntry }) {
  const queryClient = useQueryClient();
  const key = ["student-booking-settings", academy.id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await getStudentBookingSettings(academy.id);
      if (!result.ok) throw new Error(result.error);
      return result.settings;
    },
  });
  const [draft, setDraft] = useState<{ revision: number; value: Draft } | null>(null);
  const save = useMutation({
    mutationFn: async (input: { settings: BookingSettings; value: Draft }) => {
      const result = await saveStudentBookingSettings(academy.id, {
        yearId: input.settings.year!.id, expectedRevision: input.settings.settings.revision, ...input.value,
      });
      if (!result.ok) throw new Error(result.error);
      return result.settings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData<BookingSettings>(key, settings);
      setDraft(null);
      toast.success("Booking settings saved");
    },
    onError: (error) => {
      toast.error(SAVE_ERRORS[error.message] ?? "Couldn’t save the settings. Try again.");
      if (error.message === "stale" || error.message === "year_unavailable") {
        setDraft(null);
        void query.refetch();
      }
    },
  });

  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
        <AlertTitle>Couldn’t load booking settings</AlertTitle>
        <AlertDescription>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const settings = query.data;
  if (!settings.year) {
    return (
      <Alert>
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-hidden="true" />
        <AlertTitle>No open academic year</AlertTitle>
      </Alert>
    );
  }
  const year = settings.year;
  const { revision, ...saved } = settings.settings;
  // A draft made against an older revision is dropped once newer settings arrive.
  const value = draft && draft.revision === revision ? draft.value : saved;
  const dirty = value !== saved;
  const manage = settings.canManage;
  const editable = manage && !save.isPending;
  const change = (next: Partial<Draft>) => setDraft({ revision, value: { ...value, ...next } });
  // Switches show whether a choice is offered; the settings store what is excluded.
  const toggle = (field: ChoiceField, id: string, offered: boolean) =>
    change({ [field]: offered ? value[field].filter((entry) => entry !== id) : [...value[field], id] });
  const excluded = value.excludedLevelIds.length + value.excludedTrackIds.length + value.excludedGroupIds.length;
  const onOff = (on: boolean) => <Badge variant={on ? "default" : "secondary"}>{on ? "On" : "Off"}</Badge>;

  return (
    <div className="flex flex-col gap-10">
      <SettingsGroup title="Booking form" action={
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <HugeiconsIcon icon={ViewIcon} strokeWidth={1.5} aria-hidden="true" />
              Preview
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
            <DialogTitle className="sr-only">Booking form preview</DialogTitle>
            <Badge variant="secondary" className="w-fit">Preview</Badge>
            <AutoHeight>
              <BookingFormPreview form={{
                result: "open",
                academy: { id: academy.id, name: academy.name, slug: academy.slug, icon: academy.icon },
                year,
                revision,
                groupOptional: value.allowWithoutGroup,
                participation: value.participationMode,
                programs: previewPrograms(settings.catalog, value),
              }} />
            </AutoHeight>
          </DialogContent>
        </Dialog>
      }>
        <Row id="booking-open" title="Accept registrations"
          description={value.open ? "Students can register through the booking link." : "The booking link shows that registration is closed."}>
          {manage
            ? <Switch id="booking-open" checked={value.open} disabled={!editable} onCheckedChange={(open) => change({ open })} />
            : onOff(value.open)}
        </Row>
        <Row id="booking-link" title="Booking link" description="Anyone with this link can open the form.">
          {settings.link ? <LinkCopy link={settings.link} /> : <span className="text-sm text-muted-foreground">No link yet</span>}
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Registration">
        <Row id="booking-type" title="Student type" description="How new students will attend, or let them choose on the form.">
          {manage ? (
            <Select value={value.participationMode} disabled={!editable} onValueChange={(mode) => change({ participationMode: mode as ParticipationMode })}>
              <SelectTrigger id="booking-type" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODES) as ParticipationMode[]).map((mode) => <SelectItem key={mode} value={mode}>{MODES[mode]}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : <span className="text-sm">{MODES[value.participationMode]}</span>}
        </Row>
        <Row id="booking-offerings" title="Levels and groups"
          description={excluded ? `${excluded} excluded from the form.` : "Every level, track and group is offered."}>
          <OfferingsSheet catalog={settings.catalog} value={value} manage={manage} disabled={!editable} onToggle={toggle} />
        </Row>
        <Row id="booking-no-group" title="Allow registration without a group"
          description="Students can register before a group is assigned.">
          {manage
            ? <Switch id="booking-no-group" checked={value.allowWithoutGroup} disabled={!editable} onCheckedChange={(allowWithoutGroup) => change({ allowWithoutGroup })} />
            : onOff(value.allowWithoutGroup)}
        </Row>
      </SettingsGroup>

      {manage && dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur" role="status">
          <span className="text-sm font-medium">Unsaved changes</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setDraft(null)}>Discard</Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate({ settings, value })}>
              {save.isPending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OfferingsSheet({ catalog, ...props }: { catalog: BookingCatalog } & OfferingProps) {
  return (
    <FloatingSheet>
      <FloatingSheetTrigger asChild>
        <Button id="booking-offerings" type="button" variant="ghost" size="sm">
          <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} aria-hidden="true" />
          {props.manage ? "Manage" : "View"}
        </Button>
      </FloatingSheetTrigger>
      <FloatingSheetContent className="gap-0" aria-describedby={undefined}>
        <FloatingSheetHeader className="border-b">
          <FloatingSheetTitle className="text-lg font-semibold">Levels and groups</FloatingSheetTitle>
        </FloatingSheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {catalog.length === 0
            ? <p className="p-2 text-sm text-muted-foreground">No levels are offered.</p>
            : catalog.map((level) => <LevelOfferings key={level.id} level={level} {...props} />)}
        </div>
      </FloatingSheetContent>
    </FloatingSheet>
  );
}

type OfferingProps = {
  value: Draft;
  manage: boolean;
  disabled: boolean;
  onToggle: (field: ChoiceField, id: string, offered: boolean) => void;
};

function LevelOfferings({ level, value, manage, disabled, onToggle }: { level: BookingCatalog[number] } & OfferingProps) {
  const trackName = new Map(level.tracks.map((track) => [track.id, track.name]));
  // Track groups need an active track; level-wide groups fit every track of the level.
  const groups = level.groups.filter((group) => group.trackId === null || trackName.has(group.trackId));
  const trackless = level.tracks.length === 0;
  const trackOffered = (id: string) => !value.excludedTrackIds.includes(id);
  // A group can only be booked through an offered level or track; others are dimmed.
  const reachable = (trackId: string | null) =>
    trackless ? !value.excludedLevelIds.includes(level.id) : trackId ? trackOffered(trackId) : level.tracks.some((track) => trackOffered(track.id));
  const control = { manage, disabled };
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          {trackless ? <Label htmlFor={manage ? `booking-level-${level.id}` : undefined} className="font-semibold">{level.name}</Label> : level.name}
        </h3>
        {trackless && <Toggle id={`booking-level-${level.id}`} offered={!value.excludedLevelIds.includes(level.id)}
          onChange={(on) => onToggle("excludedLevelIds", level.id, on)} {...control} />}
      </div>
      {!trackless && (
        <OfferingList title="Tracks">
          {level.tracks.map((track) => (
            <Offering key={track.id} id={`booking-track-${track.id}`} label={track.name} offered={trackOffered(track.id)}
              onChange={(on) => onToggle("excludedTrackIds", track.id, on)} {...control} />
          ))}
        </OfferingList>
      )}
      {groups.length > 0 && (
        <OfferingList title="Groups">
          {groups.map((group) => {
            const facts = [group.trackId ? trackName.get(group.trackId) : !trackless && "All tracks", group.capacity != null && `${group.capacity} places`].filter(Boolean);
            return (
              <Offering key={group.id} id={`booking-group-${group.id}`} label={group.name} muted={!reachable(group.trackId)}
                offered={!value.excludedGroupIds.includes(group.id)} onChange={(on) => onToggle("excludedGroupIds", group.id, on)} {...control}
                meta={(facts.length > 0 || group.slots.length > 0) && (
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {facts.length > 0 && <span>{facts.join(" · ")}</span>}
                    <GroupSchedule slots={group.slots} />
                  </div>
                )} />
            );
          })}
        </OfferingList>
      )}
    </section>
  );
}

function OfferingList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 px-4 pt-2.5 pb-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-col divide-y divide-border/40">{children}</div>
    </div>
  );
}

function Offering({ id, label, meta, offered, muted, manage, disabled, onChange }: {
  id: string; label: string; meta?: React.ReactNode; offered: boolean; muted?: boolean; manage: boolean; disabled: boolean; onChange: (on: boolean) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2.5 transition-opacity", muted && "opacity-50")}>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={manage ? id : undefined} className="font-medium">{label}</Label>
        {meta}
      </div>
      <Toggle id={id} offered={offered} manage={manage} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function Toggle({ id, offered, manage, disabled, onChange }: { id: string; offered: boolean; manage: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return manage
    ? <Switch id={id} checked={offered} disabled={disabled} onCheckedChange={onChange} />
    : <Badge variant={offered ? "default" : "secondary"}>{offered ? "On" : "Off"}</Badge>;
}

/** Eases height changes as fields appear and disappear instead of snapping. */
function AutoHeight({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState<number | "auto">("auto");
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize[0].blockSize));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    // The negative margin and padding keep focus rings from being clipped.
    <motion.div initial={false} animate={{ height }} transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }} className="-m-1 overflow-hidden">
      <div ref={measure} className="p-1">{children}</div>
    </motion.div>
  );
}

function LinkCopy({ link }: { link: string }) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await copyInvitationLink(link, box!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy the link. Select it and copy it manually.");
    }
  }
  return (
    <div ref={setBox}>
      <InputGroup className="h-8 w-72 border-transparent bg-muted/60 shadow-none sm:w-92 dark:bg-muted/60">
        <InputGroupInput id="booking-link" readOnly dir="ltr" value={link} className="text-muted-foreground" onFocus={(event) => event.currentTarget.select()} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="xs" className="text-foreground!" aria-label={copied ? "Copied" : "Copy booking link"} onClick={() => void copy()}>
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={1.5} aria-hidden="true" />
            {copied ? "Copied" : "Copy"}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
