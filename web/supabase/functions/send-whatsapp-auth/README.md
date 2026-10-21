# WhatsApp authentication hook

Current source: index.ts and ../_shared/whatsapp-auth.ts. This receives Supabase's Send SMS Hook and delivers the phone OTP through Meta WhatsApp; it is not the parent academic-notification worker.

## Authentication and configuration

Verify the hook signature against SEND_SMS_HOOK_SECRET before parsing/using the payload. The destination comes from sms.phone, falling back to user.phone. Valid payloads require the expected phone shape and six-digit OTP.

Required server-side values: SEND_SMS_HOOK_SECRET, META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID and META_WHATSAPP_TEMPLATE_LANGUAGE. META_WHATSAPP_GRAPH_API_VERSION optionally overrides the source default. Production template name is verify; the language and button/body payload must match the approved Authentication template. See the shared builder for the exact provider payload.

Synthetic development accounts and contacts registered in the development registry never receive codes, and registry lookup failures fail closed. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the lookup; a blocked recipient returns a 403 hook error and a failed lookup returns a 503 hook error, both with HTTP 200 as the hook contract requires.

Deploy this signed-hook function without gateway JWT verification; its request authority is the verified hook signature. Using the configured project, the existing deployment form is:

```sh
npx supabase functions deploy send-whatsapp-auth --project-ref <project-ref> --no-verify-jwt --use-api
```

Configure Supabase Phone confirmation and its Send SMS Hook URL/secret. Source retries transient delivery once, with no SMS fallback. A function deployment is not proof that the sender/template is production-ready.

## Development versus production

WHATSAPP_DEVELOPMENT_MODE=true redirects to WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE and logs EDRA_DEV_AUTH_CODE (last four phone digits and the code only). It uses jaspers_market_order_confirmation_v1, not the production verify template. Missing/invalid test recipient fails closed. This is fake-number/test delivery only.

When development routing is off, EDRA_AUTH_DEV_LOG_PHONE plus a short EDRA_AUTH_DEV_LOG_UNTIL can enable a one-number log-only path. Remove those overrides and disable development mode for real users. Never log production OTPs or expose hook/provider secrets to clients.

Use [deployment](../../../docs/technical/deployment.md) for the release sequence and controlled-phone verification. No sender configuration, function deployment or delivery was verified by this documentation update.

## Testing

From `web/`, with Deno 2 on PATH, run `npm run test:edge` for static checks and `npm run test:edge:runtime` for all four isolated entrypoint suites, including this function's `index_test.ts`. Each uses its own dependency map and frozen lockfile; runtime tests are typechecked.

The Deno suite checks the real signed-hook entrypoint: environment wiring, configured/default Graph version, sms.phone routing, signature rejection, missing settings, development recipient/template selection and captured OTP logging. The existing 13-case shared-handler Vitest suite still runs under `npm test`.

Tests capture `Deno.serve` without opening a listener, clear/restore named configuration, use only dummy values and explicitly intercept fetch; unexpected calls fail. Runtime network is denied, with no Supabase instance, real credentials, messages or paid services. Dependency caching may download packages. Neither static checks, Node unit tests nor these Deno tests establish hosted gateway behavior or actual delivery. See [verification](../../../docs/engineering.md#edge-function-checks) for the CI command and evidence boundaries.
