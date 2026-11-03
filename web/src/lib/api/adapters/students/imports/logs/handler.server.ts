import "@tanstack/react-start/server-only";
import { listImportLogs } from "@/modules/students/records/imports/data";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const page = query.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(page)) return Response.json({ error: "Invalid page" }, { status: 400 });
  const result = await listImportLogs(query.get("academy") ?? "", Number(page) - 1);
  return result.ok ? Response.json(result.data) : Response.json({ error: "Couldn’t load import logs" }, { status: result.status });
}
