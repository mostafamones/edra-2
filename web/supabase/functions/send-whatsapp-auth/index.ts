import { handleWhatsAppAuthHook } from "../_shared/whatsapp-auth.ts";

Deno.serve((request) => handleWhatsAppAuthHook(request, {
  hookSecret: Deno.env.get("SEND_SMS_HOOK_SECRET"),
  accessToken: Deno.env.get("META_WHATSAPP_ACCESS_TOKEN"),
  phoneNumberId: Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID"),
  templateLanguage: Deno.env.get("META_WHATSAPP_TEMPLATE_LANGUAGE"),
  graphApiVersion: Deno.env.get("META_WHATSAPP_GRAPH_API_VERSION") ?? "v23.0",
  devLogPhone: Deno.env.get("EDRA_AUTH_DEV_LOG_PHONE"),
  devLogUntil: Deno.env.get("EDRA_AUTH_DEV_LOG_UNTIL"),
  whatsappDevelopmentMode: Deno.env.get("WHATSAPP_DEVELOPMENT_MODE")?.trim().toLowerCase() === "true",
  whatsappDevelopmentRecipientPhone: Deno.env.get("WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE"),
}));
