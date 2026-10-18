# WhatsApp authentication hook

Current source: index.ts and ../_shared/whatsapp-auth.ts. This receives Supabase's Send SMS Hook and delivers the phone OTP through Meta WhatsApp; it is not the parent academic-notification worker.

## Authentication and configuration

Verify the hook signature against SEND_SMS_HOOK_SECRET before parsing/using the payload. The destination comes from sms.phone, falling back to user.phone. Valid payloads require the expected phone shape and six-digit OTP.

Required server-side values: SEND_SMS_HOOK_SECRET, META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID and META_WHATSAPP_TEMPLATE_LANGUAGE. META_WHATSAPP_GRAPH_API_VERSION optionally overrides the source default. Production template name is verify; the language and button/body payload must match the approved Authentication template. See the shared builder for the exact provider payload.

Deploy this signed-hook function without gateway JWT verification; its request authority is the verified hook signature. Using the configured project, the existing deployment form is:

```sh
npx supabase functions deploy send-whatsapp-auth --project-ref <project-ref> --no-verify-jwt --use-api
```

Configure Supabase Phone confirmation and its Send SMS Hook URL/secret. Source retries transient delivery once, with no SMS fallback. A function deployment is not proof that the sender/template is production-ready.

## Development versus production

WHATSAPP_DEVELOPMENT_MODE=true redirects to WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE and logs EDRA_DEV_AUTH_CODE (last four phone digits and the code only). It uses jaspers_market_order_confirmation_v1, not the production verify template. Missing/invalid test recipient fails closed. This is fake-number/test delivery only.

When development routing is off, EDRA_AUTH_DEV_LOG_PHONE plus a short EDRA_AUTH_DEV_LOG_UNTIL can enable a one-number log-only path. Remove those overrides and disable development mode for real users. Never log production OTPs or expose hook/provider secrets to clients.

Use [deployment](../../../docs/technical/deployment.md) for the release sequence and controlled-phone verification. No sender configuration, function deployment or delivery was verified by this documentation update.
