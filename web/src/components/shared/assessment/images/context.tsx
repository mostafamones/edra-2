"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { newUuid } from "@/lib/uuid";
import { IMAGE_BUCKET, IMAGE_TYPES, imagePath, MAX_IMAGE_BYTES } from "./tokens";

/** Signed URLs last an hour; refetch a little before they expire. */
const URL_SECONDS = 60 * 60;

type Upload = { id: string; done: Promise<boolean> };
type ImagesValue = {
  academyId: string;
  /** Starts uploading a pasted file under a new id; null (with a toast) when the file is not accepted. */
  upload: (file: File) => Upload | null;
  uploading: ReadonlySet<string>;
};

const ImagesContext = createContext<ImagesValue | null>(null);

/** Uploads and reads question images for one academy; RLS limits both to its staff. */
export function ImagesProvider({ academyId, children }: { academyId: string; children: ReactNode }) {
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());

  const upload = useCallback((file: File): Upload | null => {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Paste a PNG, JPEG, WebP, or GIF image.");
      return null;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Images can be up to 5 MB.");
      return null;
    }
    const id = newUuid();
    setUploading((current) => new Set(current).add(id));
    const done = createClient().storage.from(IMAGE_BUCKET)
      .upload(imagePath(academyId, id), file, { contentType: file.type, upsert: false })
      .then(({ error }) => !error, () => false)
      .then((ok) => {
        if (!ok) toast.error("Could not upload the image. Check your connection and try again.");
        setUploading((current) => { const next = new Set(current); next.delete(id); return next; });
        return ok;
      });
    return { id, done };
  }, [academyId]);

  const value = useMemo(() => ({ academyId, upload, uploading }), [academyId, upload, uploading]);
  return <ImagesContext.Provider value={value}>{children}</ImagesContext.Provider>;
}

export function useImages() {
  const value = useContext(ImagesContext);
  if (!value) throw new Error("useImages must be used inside ImagesProvider");
  return value;
}

/** A short-lived URL for an image, once its upload has finished. */
export function useImageUrl(id: string) {
  const { academyId, uploading } = useImages();
  const pending = uploading.has(id);
  const query = useQuery({
    queryKey: ["question-image", academyId, id],
    enabled: !pending,
    staleTime: (URL_SECONDS - 5 * 60) * 1000,
    queryFn: async () => {
      const { data, error } = await createClient().storage.from(IMAGE_BUCKET).createSignedUrl(imagePath(academyId, id), URL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  return { url: query.data, loading: pending || query.isPending, failed: query.isError };
}
