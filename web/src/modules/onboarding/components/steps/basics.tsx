"use client";
import { platformOrigin } from "@/lib/routing";

import { motion, useReducedMotion } from "framer-motion";
import { IconBook as BookOpen, IconCode as Code2, IconSchool as GraduationCap, IconWorld as Globe2, IconInfoCircle as Info, IconMicroscope as Microscope, IconMusic as Music2, IconPalette as Palette, IconBuildingCommunity as School, IconTrophy as Trophy } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { type AcademyDraft, cleanSlugInput, makeSlug } from "../../academy-draft";
import { academyCreationCopy } from "../../copy/academy-creation";

const COPY = academyCreationCopy;

export const ICONS = [
  { id: "school", label: COPY.identity.icons.school, Icon: School },
  { id: "book", label: COPY.identity.icons.book, Icon: BookOpen },
  { id: "graduate", label: COPY.identity.icons.graduate, Icon: GraduationCap },
  { id: "science", label: COPY.identity.icons.science, Icon: Microscope },
  { id: "code", label: COPY.identity.icons.code, Icon: Code2 },
  { id: "art", label: COPY.identity.icons.art, Icon: Palette },
  { id: "music", label: COPY.identity.icons.music, Icon: Music2 },
  { id: "trophy", label: COPY.identity.icons.trophy, Icon: Trophy },
  { id: "world", label: COPY.identity.icons.world, Icon: Globe2 },
] as const;

const SUBJECTS = COPY.profile.subjectOptions;

const GENERIC_ACADEMY_WORDS = new Set([
  "academy", "school", "university", "institute", "college", "center", "centre", "hub", "lab", "studio",
]);

function getSlugSuggestions(name: string, currentSlug: string) {
  const words = makeSlug(name).split("-").filter((word) => word.length > 2 && !GENERIC_ACADEMY_WORDS.has(word));
  const suggestions = [
    makeSlug(name),
    name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ...words.slice(-2),
  ];
  return [...new Set(suggestions)].filter((slug) => slug && slug !== currentSlug).slice(0, 4);
}

export function BasicsStep({
  section,
  draft,
  update,
  errors,
  manualSlug,
  setManualSlug,
  customSubject,
  setCustomSubject,
  slugStatus,
}: {
  section: "identity" | "profile";
  draft: AcademyDraft;
  update: (change: Partial<AcademyDraft>) => void;
  errors: Record<string, string>;
  manualSlug: boolean;
  setManualSlug: (manual: boolean) => void;
  customSubject: boolean;
  setCustomSubject: (custom: boolean) => void;
  slugStatus: "checking" | "available" | "taken" | "unavailable" | null;
}) {
  const reduceMotion = useReducedMotion();
  const slugSuggestions = getSlugSuggestions(draft.name, draft.slug);
  const keepManualSlug = manualSlug || Boolean(draft.slug && draft.slug !== makeSlug(draft.name));
  const isCustomSubject = customSubject || draft.customSubject || Boolean(draft.subject && !SUBJECTS.includes(draft.subject as (typeof SUBJECTS)[number]));

  if (section === "identity") {
    return (
      <div className="space-y-8">
        <Field>
          <FieldLabel htmlFor="academy-name">{COPY.identity.nameLabel}</FieldLabel>
          <Input
            id="academy-name"
            value={draft.name}
            onChange={(event) => {
              const name = event.target.value;
              update({ name, ...(keepManualSlug ? {} : { slug: makeSlug(name) }) });
            }}
            maxLength={80}
            placeholder={COPY.identity.namePlaceholder}
            autoComplete="organization"
            aria-invalid={Boolean(errors.name)}
            className="h-11 rounded-lg px-3 text-sm"
          />
          <FieldError>{errors.name}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{COPY.identity.iconLabel}</FieldLabel>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-9" role="group" aria-label={COPY.identity.iconGroupLabel}>
            {ICONS.map(({ id, label, Icon }) => (
              <motion.div key={id} whileTap={reduceMotion ? undefined : { scale: 0.94 }}>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={label}
                  aria-pressed={draft.icon === id}
                  onClick={() => update({ icon: id })}
                  className={cn(
                    "h-12 w-full min-w-0 rounded-lg border-border/80 px-0 hover:border-primary/50",
                    draft.icon === id && "border-primary bg-primary/8 text-primary ring-1 ring-primary/40"
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </Button>
              </motion.div>
            ))}
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Field>
        <FieldLabel>{COPY.profile.subjectLabel}</FieldLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={COPY.profile.subjectGroupLabel}>
          {SUBJECTS.map((subject) => (
            <motion.div key={subject} whileTap={reduceMotion ? undefined : { scale: 0.985 }}>
              <Button
                type="button"
                variant="outline"
                aria-pressed={!isCustomSubject && draft.subject === subject}
                onClick={() => { setCustomSubject(false); update({ subject, customSubject: false }); }}
                className={cn(
                  "h-11 w-full justify-start rounded-lg border-border/80 px-3 text-left font-normal whitespace-normal",
                  !isCustomSubject && draft.subject === subject && "border-primary bg-primary/8 font-medium text-primary ring-1 ring-primary/40"
                )}
              >
                {subject}
              </Button>
            </motion.div>
          ))}
          <Button
            type="button"
            variant="outline"
            aria-pressed={isCustomSubject}
            onClick={() => { setCustomSubject(true); update({ subject: "", customSubject: true }); }}
            className={cn(
              "h-11 justify-start rounded-lg border-border/80 px-3 font-normal",
              isCustomSubject && "border-primary bg-primary/8 font-medium text-primary ring-1 ring-primary/40"
            )}
          >
            {COPY.profile.otherSubject}
          </Button>
        </div>
        {isCustomSubject && (
          <Input
          value={draft.subject}
          onChange={(event) => update({ subject: event.target.value })}
          placeholder={COPY.profile.otherSubjectPlaceholder}
          aria-label={COPY.profile.otherSubjectLabel}
          maxLength={60}
          className="h-11 rounded-lg px-3"
          />
        )}
        <FieldError>{errors.subject}</FieldError>
      </Field>
      <Field>
        <div className="flex items-center gap-1.5">
          <FieldLabel htmlFor="academy-slug">{COPY.profile.linkLabel}</FieldLabel>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={COPY.profile.linkInfoLabel}
                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4} className="max-w-64 whitespace-normal leading-5">
              {COPY.profile.linkInfo}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex h-11 overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <span className="flex shrink-0 items-center border-r border-border bg-muted/50 px-3 text-sm text-muted-foreground">{platformOrigin("staff") + "/"}</span>
          <Input
            id="academy-slug"
            value={draft.slug}
            onChange={(event) => {
              setManualSlug(true);
              update({ slug: cleanSlugInput(event.target.value) });
            }}
            maxLength={50}
            placeholder={COPY.profile.linkPlaceholder}
            aria-invalid={Boolean(errors.slug)}
            className="h-full rounded-none border-0 px-3 shadow-none focus-visible:ring-0"
          />
        </div>
        {slugSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label={COPY.profile.suggestionsLabel}>
            <span className="text-xs text-muted-foreground">{COPY.profile.suggestions}</span>
            {slugSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setManualSlug(true); update({ slug: suggestion }); }}
                className="h-7 rounded-full px-3 font-normal"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
        <FieldError>{errors.slug}</FieldError>
        {!errors.slug && slugStatus && (
          <p
            aria-live="polite"
            className={`text-xs ${slugStatus === "available" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
          >
            {slugStatus === "checking" && COPY.profile.checking}
            {slugStatus === "available" && COPY.profile.available}
            {slugStatus === "unavailable" && COPY.profile.checkWhenCreated}
          </p>
        )}
      </Field>
    </div>
  );
}
