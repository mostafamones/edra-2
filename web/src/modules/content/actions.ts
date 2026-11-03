import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  loadWorkspace as loadWorkspaceServer,
  loadUnit as loadUnitServer,
  loadUnitHistory as loadUnitHistoryServer,
  loadUnitPanels as loadUnitPanelsServer,
  createUnit as createUnitServer,
  saveUnit as saveUnitServer,
  changeUnit as changeUnitServer,
  saveUnitVersion as saveUnitVersionServer,
  publishUnitEdits as publishUnitEditsServer,
  copyUnit as copyUnitServer,
  loadUnitPublication as loadUnitPublicationServer,
  scheduleUnitPublication as scheduleUnitPublicationServer,
  cancelUnitPublication as cancelUnitPublicationServer,
  assessmentOptions as assessmentOptionsServer,
  reuseMaterial as reuseMaterialServer,
  createAttachedAssessment as createAttachedAssessmentServer,
} from "./actions.server";

const loadWorkspaceFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.string()]) }))
  .handler(({ data }) => loadWorkspaceServer(...(data.args as Parameters<typeof loadWorkspaceServer>)));

export async function loadWorkspace(...args: Parameters<typeof loadWorkspaceServer>): Promise<Awaited<ReturnType<typeof loadWorkspaceServer>>> {
  return loadWorkspaceFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadWorkspaceServer>>>;
}

const loadUnitFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.string(), z.string()]) }))
  .handler(({ data }) => loadUnitServer(...(data.args as Parameters<typeof loadUnitServer>)));

export async function loadUnit(...args: Parameters<typeof loadUnitServer>): Promise<Awaited<ReturnType<typeof loadUnitServer>>> {
  return loadUnitFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadUnitServer>>>;
}

const loadUnitHistoryFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => loadUnitHistoryServer(...(data.args as Parameters<typeof loadUnitHistoryServer>)));

export async function loadUnitHistory(...args: Parameters<typeof loadUnitHistoryServer>): Promise<Awaited<ReturnType<typeof loadUnitHistoryServer>>> {
  return loadUnitHistoryFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadUnitHistoryServer>>>;
}

const loadUnitPanelsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => loadUnitPanelsServer(...(data.args as Parameters<typeof loadUnitPanelsServer>)));

export async function loadUnitPanels(...args: Parameters<typeof loadUnitPanelsServer>): Promise<Awaited<ReturnType<typeof loadUnitPanelsServer>>> {
  return loadUnitPanelsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadUnitPanelsServer>>>;
}

const createUnitFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => createUnitServer(...(data.args as Parameters<typeof createUnitServer>)));

export async function createUnit(...args: Parameters<typeof createUnitServer>): Promise<Awaited<ReturnType<typeof createUnitServer>>> {
  return createUnitFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof createUnitServer>>>;
}

const saveUnitFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => saveUnitServer(...(data.args as Parameters<typeof saveUnitServer>)));

export async function saveUnit(...args: Parameters<typeof saveUnitServer>): Promise<Awaited<ReturnType<typeof saveUnitServer>>> {
  return saveUnitFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof saveUnitServer>>>;
}

const changeUnitFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => changeUnitServer(...(data.args as Parameters<typeof changeUnitServer>)));

export async function changeUnit(...args: Parameters<typeof changeUnitServer>): Promise<Awaited<ReturnType<typeof changeUnitServer>>> {
  return changeUnitFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof changeUnitServer>>>;
}

const saveUnitVersionFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => saveUnitVersionServer(...(data.args as Parameters<typeof saveUnitVersionServer>)));

export async function saveUnitVersion(...args: Parameters<typeof saveUnitVersionServer>): Promise<Awaited<ReturnType<typeof saveUnitVersionServer>>> {
  return saveUnitVersionFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof saveUnitVersionServer>>>;
}

const publishUnitEditsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => publishUnitEditsServer(...(data.args as Parameters<typeof publishUnitEditsServer>)));

export async function publishUnitEdits(...args: Parameters<typeof publishUnitEditsServer>): Promise<Awaited<ReturnType<typeof publishUnitEditsServer>>> {
  return publishUnitEditsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof publishUnitEditsServer>>>;
}

const copyUnitFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => copyUnitServer(...(data.args as Parameters<typeof copyUnitServer>)));

export async function copyUnit(...args: Parameters<typeof copyUnitServer>): Promise<Awaited<ReturnType<typeof copyUnitServer>>> {
  return copyUnitFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof copyUnitServer>>>;
}

const assessmentOptionsFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.string(), z.unknown()]) }))
  .handler(({ data }) => assessmentOptionsServer(...(data.args as Parameters<typeof assessmentOptionsServer>)));

export async function assessmentOptions(...args: Parameters<typeof assessmentOptionsServer>): Promise<Awaited<ReturnType<typeof assessmentOptionsServer>>> {
  return assessmentOptionsFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof assessmentOptionsServer>>>;
}

const reuseMaterialFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => reuseMaterialServer(...(data.args as Parameters<typeof reuseMaterialServer>)));

export async function reuseMaterial(...args: Parameters<typeof reuseMaterialServer>): Promise<Awaited<ReturnType<typeof reuseMaterialServer>>> {
  return reuseMaterialFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof reuseMaterialServer>>>;
}

const createAttachedAssessmentFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => createAttachedAssessmentServer(...(data.args as Parameters<typeof createAttachedAssessmentServer>)));

export async function createAttachedAssessment(...args: Parameters<typeof createAttachedAssessmentServer>): Promise<Awaited<ReturnType<typeof createAttachedAssessmentServer>>> {
  return createAttachedAssessmentFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof createAttachedAssessmentServer>>>;
}

const loadUnitPublicationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown(), z.unknown()]) }))
  .handler(({ data }) => loadUnitPublicationServer(...(data.args as Parameters<typeof loadUnitPublicationServer>)));

export async function loadUnitPublication(...args: Parameters<typeof loadUnitPublicationServer>): Promise<Awaited<ReturnType<typeof loadUnitPublicationServer>>> {
  return loadUnitPublicationFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof loadUnitPublicationServer>>>;
}

const scheduleUnitPublicationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => scheduleUnitPublicationServer(...(data.args as Parameters<typeof scheduleUnitPublicationServer>)));

export async function scheduleUnitPublication(...args: Parameters<typeof scheduleUnitPublicationServer>): Promise<Awaited<ReturnType<typeof scheduleUnitPublicationServer>>> {
  return scheduleUnitPublicationFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof scheduleUnitPublicationServer>>>;
}

const cancelUnitPublicationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ args: z.tuple([z.unknown()]) }))
  .handler(({ data }) => cancelUnitPublicationServer(...(data.args as Parameters<typeof cancelUnitPublicationServer>)));

export async function cancelUnitPublication(...args: Parameters<typeof cancelUnitPublicationServer>): Promise<Awaited<ReturnType<typeof cancelUnitPublicationServer>>> {
  return cancelUnitPublicationFn({ data: { args } }) as Promise<Awaited<ReturnType<typeof cancelUnitPublicationServer>>>;
}
