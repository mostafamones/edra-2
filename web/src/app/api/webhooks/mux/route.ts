import { validMuxWebhook } from "@/lib/video/mux";
import { synchronizeProviderUpload } from "@/modules/content/server";

export async function POST(request: Request) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024 * 1024) return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 1024 * 1024 || !validMuxWebhook(body, request.headers.get("mux-signature"), secret)) return new Response(null, { status: 401 });
  try {
    const event = JSON.parse(body) as { data?: { id?: string; upload_id?: string }; type?: string };
    const uploadId = event.type?.startsWith("video.upload.") ? event.data?.id : event.data?.upload_id;
    if (uploadId) await synchronizeProviderUpload(uploadId);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
