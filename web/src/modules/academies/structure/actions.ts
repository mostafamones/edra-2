import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadStructure as loadStructureServer,
  previewStructureChange as previewStructureChangeServer,
  changeStructure as changeStructureServer,
} from "./actions.server";

const loadStructureFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ slug: z.unknown() }))
  .handler(({ data }) => loadStructureServer(data.slug as Parameters<typeof loadStructureServer>[0]));

export async function loadStructure(slug: Parameters<typeof loadStructureServer>[0]): Promise<Awaited<ReturnType<typeof loadStructureServer>>> {
  return loadStructureFn({ data: { slug } });
}

const previewStructureChangeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ slug: z.unknown(), change: z.unknown() }))
  .handler(({ data }) => previewStructureChangeServer(data.slug as Parameters<typeof previewStructureChangeServer>[0], data.change as Parameters<typeof previewStructureChangeServer>[1]));

export async function previewStructureChange(slug: Parameters<typeof previewStructureChangeServer>[0], change: Parameters<typeof previewStructureChangeServer>[1]): Promise<Awaited<ReturnType<typeof previewStructureChangeServer>>> {
  return previewStructureChangeFn({ data: { slug, change } });
}

const changeStructureFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ slug: z.unknown(), request: z.unknown() }))
  .handler(({ data }) => changeStructureServer(data.slug as Parameters<typeof changeStructureServer>[0], data.request as Parameters<typeof changeStructureServer>[1]));

export async function changeStructure(slug: Parameters<typeof changeStructureServer>[0], request: Parameters<typeof changeStructureServer>[1]): Promise<Awaited<ReturnType<typeof changeStructureServer>>> {
  return changeStructureFn({ data: { slug, request } });
}
