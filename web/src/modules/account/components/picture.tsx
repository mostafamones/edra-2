"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, ImageUploadIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { removeAvatar, uploadAvatar, type AvatarResult } from "../actions";
import { accountQueryKeys, type AccountProfile } from "../queries";
import { CropDialog, type CropSource } from "./crop-dialog";

const SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Source images stay in the browser; these limits only protect its memory. */
const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const SOURCE_MAX_SIDE = 10000;
const SOURCE_MIN_SIDE = 64;

export function ProfilePicture({ userId, profile, name, avatarUrl }: {
  userId: string;
  profile: AccountProfile;
  name: string | null;
  avatarUrl: string | undefined;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Release the selected source when it is replaced, closed or unmounted.
  useEffect(() => () => {
    if (!source) return;
    URL.revokeObjectURL(source.url);
    source.bitmap.close();
  }, [source]);

  function applyPath(avatarPath: string | null) {
    queryClient.setQueryData<AccountProfile>(accountQueryKeys.profile(userId), (previous) => previous && { ...previous, avatarPath });
    void queryClient.invalidateQueries({ queryKey: accountQueryKeys.profile(userId) });
  }

  async function choose(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!SOURCE_TYPES.includes(file.type) || file.size > SOURCE_MAX_BYTES) {
      setError("Choose a JPEG, PNG or WebP image up to 20 MB.");
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      setError("This image can’t be opened.");
      return;
    }
    const smallest = Math.min(bitmap.width, bitmap.height);
    if (smallest < SOURCE_MIN_SIDE || Math.max(bitmap.width, bitmap.height) > SOURCE_MAX_SIDE) {
      bitmap.close();
      setError("Choose an image at least 64 pixels wide and tall.");
      return;
    }
    setSource({ url: URL.createObjectURL(file), bitmap });
  }

  async function save(blob: Blob) {
    setSaving(true);
    const form = new FormData();
    form.set("file", blob);
    if (profile.avatarPath) form.set("expected", profile.avatarPath);
    const result: AvatarResult = await uploadAvatar(form).catch(() => ({ ok: false, message: "Couldn’t upload your picture. Try again." }));
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      if (result.avatarPath !== undefined) applyPath(result.avatarPath);
      return;
    }
    applyPath(result.avatarPath);
    setSource(null);
    toast.success("Picture saved");
  }

  async function remove() {
    setRemoving(true);
    const result: AvatarResult = await removeAvatar(profile.avatarPath).catch(() => ({ ok: false, message: "Couldn’t remove your picture. Try again." }));
    setRemoving(false);
    if (!result.ok) {
      toast.error(result.message);
      if (result.avatarPath !== undefined) applyPath(result.avatarPath);
      return;
    }
    applyPath(null);
    toast.success("Picture removed");
  }

  const busy = saving || removing;
  return (
    <div className="flex flex-col gap-2 px-6 py-5">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-xl">{name?.slice(0, 1).toUpperCase() || "E"}</AvatarFallback>
        </Avatar>
        <span dir="auto" className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {profile.avatarPath && (
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Remove picture" onClick={remove} disabled={busy}>
              <HugeiconsIcon icon={removing ? Loading03Icon : Delete02Icon} strokeWidth={1.5} className={removing ? "animate-spin" : undefined} aria-hidden="true" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <HugeiconsIcon icon={ImageUploadIcon} strokeWidth={1.5} aria-hidden="true" />
            {profile.avatarPath ? "Change picture" : "Upload picture"}
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept={SOURCE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Profile picture file"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <CropDialog source={source} saving={saving} onCancel={() => setSource(null)} onSave={save} />
    </div>
  );
}
