import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  deleteAccount as deleteAccountServer,
  removeAvatar as removeAvatarServer,
  saveProfile as saveProfileServer,
  uploadAvatar as uploadAvatarServer,
  type AvatarResult,
  type ProfileResult,
} from "./actions.server";

export type { AvatarResult, ProfileResult } from "./actions.server";

// Payloads stay unknown here: the implementations return their own structured validation failures.
const unknownInput = z.object({ value: z.unknown() });

const saveProfileFn = createServerFn({ method: "POST", strict: { input: false } })
  .validator(unknownInput)
  .handler(({ data }) => saveProfileServer(data.value));

const uploadAvatarFn = createServerFn({ method: "POST" })
  .validator((form: FormData) => {
    if (!(form instanceof FormData)) throw new Error("invalid_form");
    return form;
  })
  .handler(({ data }) => uploadAvatarServer(data));

const removeAvatarFn = createServerFn({ method: "POST", strict: { input: false } })
  .validator(unknownInput)
  .handler(({ data }) => removeAvatarServer(data.value as string | null));

const deleteAccountFn = createServerFn({ method: "POST", strict: { input: false } })
  .validator(unknownInput)
  .handler(({ data }) => deleteAccountServer(data.value));

export async function saveProfile(input: unknown): Promise<ProfileResult> {
  return saveProfileFn({ data: { value: input } });
}

export async function uploadAvatar(form: FormData): Promise<AvatarResult> {
  return uploadAvatarFn({ data: form });
}

export async function removeAvatar(expected: string | null): Promise<AvatarResult> {
  return removeAvatarFn({ data: { value: expected } });
}

export async function deleteAccount(confirmation: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  return deleteAccountFn({ data: { value: confirmation } });
}
