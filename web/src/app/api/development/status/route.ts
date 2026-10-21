import { previewStatusGet } from "@/modules/development/server";

export function GET() {
  return previewStatusGet();
}
