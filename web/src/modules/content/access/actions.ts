import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadAccessWorkspace as loadAccessWorkspaceServer,
  loadAccessHistory as loadAccessHistoryServer,
  loadLearningUnit as loadLearningUnitServer,
  grantUnitAccess as grantUnitAccessServer,
  revokeUnitAccess as revokeUnitAccessServer,
  redeemUnitCode as redeemUnitCodeServer,
  extendMyUnitAccess as extendMyUnitAccessServer,
  openLearningMaterial as openLearningMaterialServer,
} from "./actions.server";

const loadAccessWorkspaceFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadAccessWorkspaceServer(...(data.args as Parameters<typeof loadAccessWorkspaceServer>)));

export async function loadAccessWorkspace(...args: Parameters<typeof loadAccessWorkspaceServer>): Promise<Awaited<ReturnType<typeof loadAccessWorkspaceServer>>> {
  return loadAccessWorkspaceFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadAccessWorkspaceServer>>>;
}

const loadAccessHistoryFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadAccessHistoryServer(...(data.args as Parameters<typeof loadAccessHistoryServer>)));

export async function loadAccessHistory(...args: Parameters<typeof loadAccessHistoryServer>): Promise<Awaited<ReturnType<typeof loadAccessHistoryServer>>> {
  return loadAccessHistoryFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadAccessHistoryServer>>>;
}

const loadLearningUnitFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => loadLearningUnitServer(...(data.args as Parameters<typeof loadLearningUnitServer>)));

export async function loadLearningUnit(...args: Parameters<typeof loadLearningUnitServer>): Promise<Awaited<ReturnType<typeof loadLearningUnitServer>>> {
  return loadLearningUnitFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadLearningUnitServer>>>;
}

const grantUnitAccessFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => grantUnitAccessServer(...(data.args as Parameters<typeof grantUnitAccessServer>)));

export async function grantUnitAccess(...args: Parameters<typeof grantUnitAccessServer>): Promise<Awaited<ReturnType<typeof grantUnitAccessServer>>> {
  return grantUnitAccessFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof grantUnitAccessServer>>>;
}

const revokeUnitAccessFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => revokeUnitAccessServer(...(data.args as Parameters<typeof revokeUnitAccessServer>)));

export async function revokeUnitAccess(...args: Parameters<typeof revokeUnitAccessServer>): Promise<Awaited<ReturnType<typeof revokeUnitAccessServer>>> {
  return revokeUnitAccessFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof revokeUnitAccessServer>>>;
}

const redeemUnitCodeFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => redeemUnitCodeServer(...(data.args as Parameters<typeof redeemUnitCodeServer>)));

export async function redeemUnitCode(...args: Parameters<typeof redeemUnitCodeServer>): Promise<Awaited<ReturnType<typeof redeemUnitCodeServer>>> {
  return redeemUnitCodeFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof redeemUnitCodeServer>>>;
}

const extendMyUnitAccessFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => extendMyUnitAccessServer(...(data.args as Parameters<typeof extendMyUnitAccessServer>)));

export async function extendMyUnitAccess(...args: Parameters<typeof extendMyUnitAccessServer>): Promise<Awaited<ReturnType<typeof extendMyUnitAccessServer>>> {
  return extendMyUnitAccessFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof extendMyUnitAccessServer>>>;
}

const openLearningMaterialFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => openLearningMaterialServer(...(data.args as Parameters<typeof openLearningMaterialServer>)));

export async function openLearningMaterial(...args: Parameters<typeof openLearningMaterialServer>): Promise<Awaited<ReturnType<typeof openLearningMaterialServer>>> {
  return openLearningMaterialFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof openLearningMaterialServer>>>;
}
