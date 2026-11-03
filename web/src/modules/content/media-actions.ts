import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  beginUpload as beginUploadServer,
  finishDocument as finishDocumentServer,
  refreshVideo as refreshVideoServer,
  previewAsset as previewAssetServer,
  permanentlyDeleteVideo as permanentlyDeleteVideoServer,
} from "./media-actions.server";

const beginUploadFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => beginUploadServer(...(data.args as Parameters<typeof beginUploadServer>)));

export async function beginUpload(...args: Parameters<typeof beginUploadServer>): Promise<Awaited<ReturnType<typeof beginUploadServer>>> {
  return beginUploadFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof beginUploadServer>>>;
}

const finishDocumentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => finishDocumentServer(...(data.args as Parameters<typeof finishDocumentServer>)));

export async function finishDocument(...args: Parameters<typeof finishDocumentServer>): Promise<Awaited<ReturnType<typeof finishDocumentServer>>> {
  return finishDocumentFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof finishDocumentServer>>>;
}

const refreshVideoFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => refreshVideoServer(...(data.args as Parameters<typeof refreshVideoServer>)));

export async function refreshVideo(...args: Parameters<typeof refreshVideoServer>): Promise<Awaited<ReturnType<typeof refreshVideoServer>>> {
  return refreshVideoFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof refreshVideoServer>>>;
}

const previewAssetFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => previewAssetServer(...(data.args as Parameters<typeof previewAssetServer>)));

export async function previewAsset(...args: Parameters<typeof previewAssetServer>): Promise<Awaited<ReturnType<typeof previewAssetServer>>> {
  return previewAssetFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof previewAssetServer>>>;
}

const permanentlyDeleteVideoFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => permanentlyDeleteVideoServer(...(data.args as Parameters<typeof permanentlyDeleteVideoServer>)));

export async function permanentlyDeleteVideo(...args: Parameters<typeof permanentlyDeleteVideoServer>): Promise<Awaited<ReturnType<typeof permanentlyDeleteVideoServer>>> {
  return permanentlyDeleteVideoFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof permanentlyDeleteVideoServer>>>;
}
