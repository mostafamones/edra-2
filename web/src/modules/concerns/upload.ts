export type UploadOutcome = "uploaded" | "failed" | "aborted";

/**
 * PUTs bytes to a server-issued one-time signed Storage URL with progress. The URL only creates a
 * fresh object, so a repeated attempt after an uncertain failure reports the existing object (409)
 * and the server verification decides whether it is acceptable.
 */
export function uploadToSignedUrl(url: string, file: Blob, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve("aborted"); return; }
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "0");
    body.append("", file);
    request.open("PUT", url);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    // Storage reports an existing object as 409, or 400 with a "Duplicate" body on some versions.
    const duplicate = () => request.status === 409 || (request.status === 400 && /duplicate|already exists/i.test(request.responseText));
    request.onload = () => resolve((request.status >= 200 && request.status < 300) || duplicate() ? "uploaded" : "failed");
    request.onerror = request.ontimeout = () => resolve("failed");
    request.onabort = () => resolve("aborted");
    signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send(body);
  });
}
