import "@tanstack/react-start/server-only";

import { vapidConfig } from "./dispatch.server";

export const pushPublicKey = () => vapidConfig()?.publicKey ?? null;
