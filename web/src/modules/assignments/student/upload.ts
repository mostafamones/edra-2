"use client";

/**
 * PUTs a file to a server-issued signed Storage upload URL, reporting progress. The URL creates a
 * fresh object only; it cannot overwrite accepted work.
 */
export function uploadToSignedUrl(url: string, file: File, onProgress: (fraction: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.open("PUT", url);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = request.onabort = request.ontimeout = () => resolve(false);
    request.send(body);
  });
}
