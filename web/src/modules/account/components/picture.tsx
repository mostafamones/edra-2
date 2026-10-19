"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconLoader2, IconPhotoUp, IconTrash } from "@tabler/icons-react";
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar className="size-20">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-2xl">{name?.slice(0, 1).toUpperCase() || "E"}</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
            <IconPhotoUp aria-hidden="true" />
            {profile.avatarPath ? "Change picture" : "Upload picture"}
          </Button>
          {profile.avatarPath && (
            <Button variant="ghost" onClick={remove} disabled={busy}>
              {removing ? <IconLoader2 className="animate-spin" aria-hidden="true" /> : <IconTrash aria-hidden="true" />}
              Remove
            </Button>
          )}
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
