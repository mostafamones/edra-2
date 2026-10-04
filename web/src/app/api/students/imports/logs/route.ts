import { NextRequest, NextResponse } from "next/server";
import { listImportLogs } from "@/modules/students/records/imports/data";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const page = query.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(page)) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  const result = await listImportLogs(query.get("academy") ?? "", Number(page) - 1);
  return result.ok ? NextResponse.json(result.data) : NextResponse.json({ error: "Couldn’t load import logs" }, { status: result.status });
}
