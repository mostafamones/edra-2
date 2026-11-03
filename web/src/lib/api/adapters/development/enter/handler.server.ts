import "@tanstack/react-start/server-only";
import { previewPost } from "@/modules/development/server";

export function POST(request: Request) {
  return previewPost(request, "enter");
}
