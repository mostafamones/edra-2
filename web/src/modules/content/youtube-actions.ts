import { createServerFn } from "@tanstack/react-start";
import { registerYoutube as registerYoutubeServer } from "./youtube-actions.server";

const registerYoutubeFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => value)
  .handler(({ data }) => registerYoutubeServer(data));

export async function registerYoutube(value: unknown) {
  return registerYoutubeFn({ data: value });
}
