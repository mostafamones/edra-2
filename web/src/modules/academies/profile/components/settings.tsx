"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { HugeiconsIcon } from "@hugeicons/react";
import { Call02Icon } from "@hugeicons/core-free-icons";
import { SiFacebook, SiGooglemaps, SiInstagram, SiTiktok, SiWhatsapp } from "react-icons/si";
import { IconAlertCircle, IconLink, IconLoader2, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";

import { PhoneInput, TextInput } from "@/components/shared/app-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { FILLED_INPUTS } from "@/components/shared/filled-inputs";
import { cn } from "@/lib/utils";
import { useAcademyScope, useAuth } from "@/modules/auth";

import { ACADEMY_ICONS } from "../../icons";
import { loadAcademyProfile, saveAcademyProfile, type AcademyProfileResult } from "../actions";
import { academyProfileSchema, sameProfileValues, type AcademyProfile, type AcademyProfileFields, type AcademyProfileInput } from "../validation";

type Notice = { kind: "error"; message: string } | { kind: "conflict"; current: AcademyProfile };

const MESSAGES = {
  invalid: "Check the highlighted fields.",
  sessionExpired: "Your session has ended. Sign in again.",
  forbidden: "You no longer have permission to edit this academy.",
  saveFailed: "Couldn’t save the academy profile. Try again.",
};

/** Contacts are stored as +201…; the phone input shows the national part after its +20 prefix. */
const national = (phone: string | null) => phone?.replace(/^\+20/, "") ?? "";
const toFields = (profile: AcademyProfile): AcademyProfileFields => ({
  name: profile.name, icon: profile.icon, subject: profile.subject, phone: national(profile.phone), whatsapp: national(profile.whatsapp),
});

export function AcademyProfileSettings({ profile }: { profile: AcademyProfile | null }) {
  const router = useRouter();
  if (profile) return <ProfileForm profile={profile} />;
  return (
    <Alert variant="destructive">
      <IconAlertCircle aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-3">
        Couldn’t load the academy profile.
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>Try again</Button>
      </AlertDescription>
    </Alert>
  );
}

function ProfileForm({ profile }: { profile: AcademyProfile }) {
  const router = useRouter();
  const { refreshAcademies } = useAuth();
  const isCurrentAcademy = useAcademyScope();
  // Server refreshes re-render this page with new props; the draft and baseline only change on deliberate actions.
  const [baseline, setBaseline] = useState(profile.updatedAt);
  const [notice, setNotice] = useState<Notice | null>(null);
  const form = useForm<AcademyProfileFields, unknown, AcademyProfileInput>({
    resolver: zodResolver(academyProfileSchema),
    defaultValues: toFields(profile),
  });

  function adopt(saved: AcademyProfile) {
    form.reset(toFields(saved));
    setBaseline(saved.updatedAt);
    setNotice(null);
  }

  async function onSubmit(values: AcademyProfileInput) {
    const academyId = profile.id;
    setNotice(null);
    let result: AcademyProfileResult;
    try {
      result = await saveAcademyProfile(profile.slug, baseline, values);
    } catch {
      // The save may have committed before the response was lost: trust only the persisted state.
      const current = await loadAcademyProfile(profile.slug).catch(() => null);
      result = current && sameProfileValues(current, values) ? { ok: true, profile: current } : { ok: false, code: "saveFailed" };
      if (result.ok) router.refresh();
    }
    if (!isCurrentAcademy(academyId)) return;

    if (result.ok) {
      adopt(result.profile);
      toast.success("Academy profile saved");
      // The header and switcher read memberships too; a failed refresh does not undo the save.
      void refreshAcademies().catch(() => undefined);
      return;
    }
    if (result.code === "conflict") return setNotice({ kind: "conflict", current: result.current });
    if (result.code === "invalid") {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        if (message) form.setError(field as keyof AcademyProfileFields, { message });
      }
    }
    setNotice({ kind: "error", message: MESSAGES[result.code] });
  }

  const { errors, isSubmitting, isDirty } = form.formState;
  const readOnly = !profile.canEdit;
  const [name, subject, icon, phone, whatsapp] = useWatch({ control: form.control, name: ["name", "subject", "icon", "phone", "whatsapp"] });
  return (
    <form className={cn("grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]", FILLED_INPUTS)} onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="flex min-w-0 flex-col gap-8">
        <fieldset disabled={readOnly || isSubmitting} className="flex min-w-0 flex-col gap-10">
          <Section title="Identity">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="academy-name">Name</Label>
                <div className="flex items-start gap-1.5">
                  <Controller control={form.control} name="icon" render={({ field }) => (
                    <IconPicker value={field.value} onChange={field.onChange} disabled={readOnly || isSubmitting} />
                  )} />
                  <TextInput id="academy-name" dir="auto" autoComplete="organization" required maxLength={100} error={errors.name?.message} {...form.register("name")} />
                </div>
              </div>
              <TextInput label="Subject" dir="auto" required maxLength={60} error={errors.subject?.message} {...form.register("subject")} />
              {errors.icon && <p role="alert" className="text-xs text-destructive">{errors.icon.message}</p>}
            </div>
          </Section>
          <Section title="Contact" action={<AddContact />}>
            <div className="flex flex-col gap-2">
              <ContactRow label="Phone" icon={CONTACT_ICONS.phone} id="academy-phone">
                <PhoneInput id="academy-phone" aria-label="Phone" error={errors.phone?.message} {...form.register("phone")} />
              </ContactRow>
              <ContactRow label="WhatsApp" icon={CONTACT_ICONS.whatsapp} id="academy-whatsapp">
                <PhoneInput id="academy-whatsapp" aria-label="WhatsApp" autoComplete="off" error={errors.whatsapp?.message} {...form.register("whatsapp")} />
              </ContactRow>
            </div>
          </Section>
        </fieldset>

        {notice?.kind === "error" && <p role="alert" className="text-sm text-destructive">{notice.message}</p>}
        {notice?.kind === "conflict" && (
          <Alert>
            <IconAlertCircle aria-hidden="true" />
            <AlertDescription className="flex flex-col gap-3">
              Someone else changed this profile. Your edits haven’t been saved.
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => adopt(notice.current)}>Load latest</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setBaseline(notice.current.updatedAt); setNotice(null); }}>Keep my edits</Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
      <InstagramGradient />
      {/* On small screens the preview leads; on wide screens it stays beside the form while it scrolls. */}
      <div className="order-first flex flex-col gap-2 lg:sticky lg:top-6 lg:order-none">
        <span className="text-sm font-medium text-muted-foreground">Preview</span>
        <ProfilePreview icon={icon} name={name} subject={subject} slug={profile.slug} phone={phone ?? ""} whatsapp={whatsapp ?? ""} />
      </div>
      {!readOnly && (isDirty || isSubmitting) && (
        <div className="pointer-events-none sticky order-last bottom-6 z-10 flex justify-center lg:col-span-2">
          <div role="region" aria-label="Unsaved changes"
            className="pointer-events-auto flex items-center gap-4 rounded-lg border bg-background/95 py-1.5 pr-1.5 pl-5 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2">
            <span className="text-sm font-medium">Unsaved changes</span>
            <div className="flex gap-1">
              <Button type="button" variant="destructive" disabled={isSubmitting} onClick={() => { form.reset(); setNotice(null); }}>Discard</Button>
              <Button type="submit" disabled={isSubmitting || notice?.kind === "conflict"}>
                {isSubmitting && <IconLoader2 className="animate-spin" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}


type ContactIcon = { Icon: ComponentType<{ className?: string }>; color: string };

/** Brand marks in their brand colors (Instagram uses its gradient, defined once by InstagramGradient); TikTok follows the text color since its brand is black or white. */
const CONTACT_ICONS = {
  phone: { Icon: ({ className }) => <HugeiconsIcon icon={Call02Icon} className={className} strokeWidth={1.75} />, color: "text-foreground" },
  whatsapp: { Icon: SiWhatsapp, color: "text-[#25D366]" },
  facebook: { Icon: SiFacebook, color: "text-[#0866FF]" },
  instagram: { Icon: SiInstagram, color: "fill-[url(#academy-instagram)]" },
  tiktok: { Icon: SiTiktok, color: "text-foreground" },
  location: { Icon: SiGooglemaps, color: "text-[#4285F4]" },
} satisfies Record<string, ContactIcon>;

function InstagramGradient() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="academy-instagram" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.35" stopColor="#FA7E1E" />
          <stop offset="0.6" stopColor="#D62976" />
          <stop offset="0.8" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** A label with its icon on the left and its input on the right. */
function ContactRow({ label, icon, id, children }: { label: string; icon: ContactIcon; id: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Label htmlFor={id} className="h-10 shrink-0 gap-2">
        <icon.Icon className={cn("size-5", icon.color)} aria-hidden="true" />{label}
      </Label>
      <div className="w-full max-w-64">{children}</div>
    </div>
  );
}

/** More contact types need a schema change first, so every option is disabled for now. */
function AddContact() {
  const options = [
    { label: "Facebook", icon: CONTACT_ICONS.facebook },
    { label: "Instagram", icon: CONTACT_ICONS.instagram },
    { label: "TikTok", icon: CONTACT_ICONS.tiktok },
    { label: "Location", icon: CONTACT_ICONS.location },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="-mr-2 text-muted-foreground"><IconPlus aria-hidden="true" />Add contact</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(({ label, icon }) => (
          <DropdownMenuItem key={label} disabled><icon.Icon className={cn("size-4", icon.color)} aria-hidden="true" />{label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Section({ title, className, action, children }: { title: string; className?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function academyIcon(icon: string) {
  return ACADEMY_ICONS[icon as keyof typeof ACADEMY_ICONS] ?? ACADEMY_ICONS.school;
}

/** How the academy appears to others, updated as the fields change. The banner leaves room for later customization. */
function ProfilePreview({ icon, name, subject, slug, phone, whatsapp }: {
  icon: string; name: string; subject: string; slug: string; phone: string; whatsapp: string;
}) {
  const { Icon } = academyIcon(icon);
  // The fields hold the national number after the +20 prefix.
  const links = [
    phone.trim() && { label: "Phone", href: `tel:+20${phone.trim()}`, icon: CONTACT_ICONS.phone },
    whatsapp.trim() && { label: "WhatsApp", href: `https://wa.me/20${whatsapp.trim()}`, icon: CONTACT_ICONS.whatsapp },
  ].filter((link) => !!link);
  return (
    <div aria-label="Preview" role="figure" className="overflow-hidden rounded-xl bg-card">
      <div className="relative h-24 bg-linear-to-br from-primary via-primary/70 to-primary/30">
        {links.length > 0 && <div className="absolute top-3 right-3 flex rounded-full bg-background/60 shadow-sm backdrop-blur">
          {links.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noreferrer" aria-label={link.label}
              className="flex h-8.5 w-10 items-center justify-center rounded-full transition-colors outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50">
              <link.icon.Icon className={cn("size-4", link.icon.color)} />
            </a>
          ))}
        </div>}
      </div>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="flex items-start gap-3">
          <span className="-mt-6 flex size-18 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Icon className="size-9" aria-hidden="true" />
          </span>
          <div className="grid min-w-0 pt-2.5">
            <p dir="auto" className={cn("truncate font-heading text-lg font-semibold", !name.trim() && "text-muted-foreground")}>
              {name.trim() || "Academy name"}
            </p>
          </div>
        </div>
        <p dir="ltr" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <IconLink className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">edra.academy/{slug}</span>
        </p>
        <Badge dir="auto" variant="secondary" className={cn("max-w-full self-start", !subject.trim() && "text-muted-foreground")}>
          <span className="truncate">{subject.trim() || "Subject"}</span>
        </Badge>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { label, Icon } = academyIcon(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label={`Icon: ${label}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted/60 text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-muted">
          <Icon className="size-5" aria-hidden="true" stroke={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-2 px-1.5 py-1.5">
        <RadioGroupPrimitive.Root value={value} onValueChange={(next) => { onChange(next); setOpen(false); }} aria-label="Icon"
          className="grid grid-cols-9 gap-1.5">
          {Object.entries(ACADEMY_ICONS).map(([id, option]) => (
            <RadioGroupPrimitive.Item key={id} value={id}
              className="flex w-10 h-10 flex-col items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary">
              <option.Icon className="size-5" aria-hidden="true" stroke={1.75} />
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
      </PopoverContent>
    </Popover>
  );
}
