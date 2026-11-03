import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  changeStaffMemberRole as changeStaffMemberRoleServer,
  suspendStaffMember as suspendStaffMemberServer,
  restoreStaffMember as restoreStaffMemberServer,
  removeStaffMember as removeStaffMemberServer,
  createStaffInvitation as createStaffInvitationServer,
  revokeStaffInvitation as revokeStaffInvitationServer,
  getStaffInvitationLinks as getStaffInvitationLinksServer,
  previewStaffInvitation as previewStaffInvitationServer,
  openStaffInvitationLink as openStaffInvitationLinkServer,
  clearStaffInvitation as clearStaffInvitationServer,
  acceptStaffInvitation as acceptStaffInvitationServer,
} from "./actions.server";

const changeStaffMemberRoleFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), userId: z.unknown(), role: z.unknown() }))
  .handler(({ data }) => changeStaffMemberRoleServer(data.academyId as Parameters<typeof changeStaffMemberRoleServer>[0], data.userId as Parameters<typeof changeStaffMemberRoleServer>[1], data.role as Parameters<typeof changeStaffMemberRoleServer>[2]));

export async function changeStaffMemberRole(academyId: Parameters<typeof changeStaffMemberRoleServer>[0], userId: Parameters<typeof changeStaffMemberRoleServer>[1], role: Parameters<typeof changeStaffMemberRoleServer>[2]): Promise<Awaited<ReturnType<typeof changeStaffMemberRoleServer>>> {
  return changeStaffMemberRoleFn({ data: { academyId, userId, role } });
}

const suspendStaffMemberFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), userId: z.unknown() }))
  .handler(({ data }) => suspendStaffMemberServer(data.academyId as Parameters<typeof suspendStaffMemberServer>[0], data.userId as Parameters<typeof suspendStaffMemberServer>[1]));

export async function suspendStaffMember(academyId: Parameters<typeof suspendStaffMemberServer>[0], userId: Parameters<typeof suspendStaffMemberServer>[1]): Promise<Awaited<ReturnType<typeof suspendStaffMemberServer>>> {
  return suspendStaffMemberFn({ data: { academyId, userId } });
}

const restoreStaffMemberFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), userId: z.unknown() }))
  .handler(({ data }) => restoreStaffMemberServer(data.academyId as Parameters<typeof restoreStaffMemberServer>[0], data.userId as Parameters<typeof restoreStaffMemberServer>[1]));

export async function restoreStaffMember(academyId: Parameters<typeof restoreStaffMemberServer>[0], userId: Parameters<typeof restoreStaffMemberServer>[1]): Promise<Awaited<ReturnType<typeof restoreStaffMemberServer>>> {
  return restoreStaffMemberFn({ data: { academyId, userId } });
}

const removeStaffMemberFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), userId: z.unknown() }))
  .handler(({ data }) => removeStaffMemberServer(data.academyId as Parameters<typeof removeStaffMemberServer>[0], data.userId as Parameters<typeof removeStaffMemberServer>[1]));

export async function removeStaffMember(academyId: Parameters<typeof removeStaffMemberServer>[0], userId: Parameters<typeof removeStaffMemberServer>[1]): Promise<Awaited<ReturnType<typeof removeStaffMemberServer>>> {
  return removeStaffMemberFn({ data: { academyId, userId } });
}

const createStaffInvitationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => createStaffInvitationServer(data.value as Parameters<typeof createStaffInvitationServer>[0]));

export async function createStaffInvitation(value: Parameters<typeof createStaffInvitationServer>[0]): Promise<Awaited<ReturnType<typeof createStaffInvitationServer>>> {
  return createStaffInvitationFn({ data: { value } });
}

const revokeStaffInvitationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), invitationId: z.unknown() }))
  .handler(({ data }) => revokeStaffInvitationServer(data.academyId as Parameters<typeof revokeStaffInvitationServer>[0], data.invitationId as Parameters<typeof revokeStaffInvitationServer>[1]));

export async function revokeStaffInvitation(academyId: Parameters<typeof revokeStaffInvitationServer>[0], invitationId: Parameters<typeof revokeStaffInvitationServer>[1]): Promise<Awaited<ReturnType<typeof revokeStaffInvitationServer>>> {
  return revokeStaffInvitationFn({ data: { academyId, invitationId } });
}

const getStaffInvitationLinksFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ academyId: z.unknown(), invitationIds: z.unknown() }))
  .handler(({ data }) => getStaffInvitationLinksServer(data.academyId as Parameters<typeof getStaffInvitationLinksServer>[0], data.invitationIds as Parameters<typeof getStaffInvitationLinksServer>[1]));

export async function getStaffInvitationLinks(academyId: Parameters<typeof getStaffInvitationLinksServer>[0], invitationIds: Parameters<typeof getStaffInvitationLinksServer>[1]): Promise<Awaited<ReturnType<typeof getStaffInvitationLinksServer>>> {
  return getStaffInvitationLinksFn({ data: { academyId, invitationIds } });
}

const previewStaffInvitationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({  }))
  .handler(({ data }) => previewStaffInvitationServer());

export async function previewStaffInvitation(): Promise<Awaited<ReturnType<typeof previewStaffInvitationServer>>> {
  return previewStaffInvitationFn({ data: {  } });
}

const openStaffInvitationLinkFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({ value: z.unknown() }))
  .handler(({ data }) => openStaffInvitationLinkServer(data.value as Parameters<typeof openStaffInvitationLinkServer>[0]));

export async function openStaffInvitationLink(value: Parameters<typeof openStaffInvitationLinkServer>[0]): Promise<Awaited<ReturnType<typeof openStaffInvitationLinkServer>>> {
  return openStaffInvitationLinkFn({ data: { value } });
}

const clearStaffInvitationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({  }))
  .handler(({ data }) => clearStaffInvitationServer());

export async function clearStaffInvitation(): Promise<Awaited<ReturnType<typeof clearStaffInvitationServer>>> {
  return clearStaffInvitationFn({ data: {  } });
}

const acceptStaffInvitationFn = createServerFn({ method: "POST", strict: false })
  .validator(z.object({  }))
  .handler(({ data }) => acceptStaffInvitationServer());

export async function acceptStaffInvitation(): Promise<Awaited<ReturnType<typeof acceptStaffInvitationServer>>> {
  return acceptStaffInvitationFn({ data: {  } });
}
