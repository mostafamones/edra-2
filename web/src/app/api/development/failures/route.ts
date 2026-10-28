import { failuresGet, failuresPost } from "@/modules/development/server";

export function GET(request: Request) {
  return failuresGet(request);
}

export function POST(request: Request) {
  return failuresPost(request);
}
