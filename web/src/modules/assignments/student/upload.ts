"use client";

/**
 * PUTs a file to a server-issued signed Storage upload URL, reporting progress. The URL creates a
 * fresh object only; it cannot overwrite accepted work.
 */
export function uploadToSignedUrl(url: string, file: File, type: string, onProgress: (fraction: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "3600");
    // Untyped HEIC photos are sent with their registered type, which the bucket allowlist checks.
    body.append("", file.type === type ? file : new File([file], file.name, { type }));
    request.open("PUT", url);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = request.onabort = request.ontimeout = () => resolve(false);
    request.send(body);
  });
}
