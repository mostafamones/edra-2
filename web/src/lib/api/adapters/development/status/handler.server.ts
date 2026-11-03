import "@tanstack/react-start/server-only";
import { previewStatusGet } from "@/modules/development/server";

export function GET() {
  return previewStatusGet();
}
