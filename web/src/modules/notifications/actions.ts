import { createServerFn } from "@tanstack/react-start";

import { pushPublicKey } from "./config.server";

/** The VAPID public key (or null when push is not configured on this deployment). Never the private key. */
export const loadPushPublicKey = createServerFn({ method: "GET" }).handler(() => pushPublicKey());
