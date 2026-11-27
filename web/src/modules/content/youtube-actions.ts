import { createServerFn } from "@tanstack/react-start";
import { registerYoutube } from "./youtube-actions.server";

export const addYoutube = createServerFn({ method: "POST" }).validator((value: unknown) => value).handler(({ data }) => registerYoutube(data));
