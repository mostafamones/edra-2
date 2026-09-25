# WhatsApp authentication hook setup

The function accepts Supabase Send SMS Hook events and verifies their Standard Webhooks signature. With development mode off, it sends the OTP with the Meta WhatsApp authentication template `verify`. With development mode on, it redirects the OTP to the configured test recipient using the approved English (US) utility template `jaspers_market_order_confirmation_v1`.

## Secrets

Set these as Supabase Edge Function secrets:

- `SEND_SMS_HOOK_SECRET`: the hook secret shown by Supabase when the Send SMS Hook is created
- `META_WHATSAPP_ACCESS_TOKEN`: a server-only Meta system-user token
- `META_WHATSAPP_PHONE_NUMBER_ID`: the WhatsApp sender phone-number ID
- `META_WHATSAPP_TEMPLATE_LANGUAGE`: the exact approved language code for `verify`; the development utility template always uses `en_US`
- `META_WHATSAPP_GRAPH_API_VERSION`: optional version override; currently defaults to `v23.0`

Deploy the function without Supabase JWT verification because Supabase authenticates the request through the signed hook payload:

```sh
npx supabase functions deploy send-whatsapp-auth --project-ref fgbcjlibwgxylfwmocgx --no-verify-jwt --use-api
```

In Supabase Auth:

1. Enable the Phone provider and keep **Enable phone confirmations** on so signup requires an OTP.
2. Create a Send SMS Hook pointing to the deployed function.
3. Copy its generated secret into `SEND_SMS_HOOK_SECRET`.
4. Configure rate limits and CAPTCHA or equivalent abuse protection.
5. Keep email and OAuth enabled until `npm run audit:auth` reports that existing accounts have a migration path.

The first release retries WhatsApp once for transient errors and does not fall back to SMS.

## Development recipient routing

These Edge Function secrets are optional and default to routing to the phone supplied by Supabase:

- `WHATSAPP_DEVELOPMENT_MODE`: set to the literal `true` only on the development Supabase project to redirect every authentication WhatsApp message to the configured test recipient. Any other value leaves routing unchanged.
- `WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE`: the test recipient in E.164 format, such as `+201001234567`.

When development mode is enabled, a missing or invalid test number makes the hook fail closed; it never sends to the account's real phone as a fallback. Every valid signed hook logs `EDRA_DEV_AUTH_CODE` with the original signup phone and OTP, then sends the `jaspers_market_order_confirmation_v1` utility template to the configured test recipient. Its body parameters are `{{1}}` = the user's `full_name` metadata (or `there` if unavailable), `{{2}}` = the OTP, and `{{3}}` = `Tomorrow at 12:34` followed by the last four digits of the original phone number being verified. The template reads as an order confirmation, so this is only for testing the WhatsApp delivery path; it is not a substitute for an approved authentication template. Use the received code to verify the test account. Set the mode to `false` before using the function for real users; this all-number OTP logging stops, and the function sends the OTP using `verify` to the phone submitted to Supabase.

Set or change the secrets with the Supabase CLI:

```sh
npx supabase secrets set WHATSAPP_DEVELOPMENT_MODE=true WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE=+201001234567 --project-ref fgbcjlibwgxylfwmocgx
npx supabase secrets set WHATSAPP_DEVELOPMENT_MODE=false --project-ref fgbcjlibwgxylfwmocgx
```

Do not set these development secrets on a production project.

## Temporary development OTP log

When development mode is disabled, the optional one-number log-only path remains available: set `EDRA_AUTH_DEV_LOG_PHONE` to one test phone in E.164 format and `EDRA_AUTH_DEV_LOG_UNTIL` to a near-term ISO 8601 UTC timestamp. That matching signed hook writes the code to Edge Function Logs and returns success without sending to Meta. Remove both secrets when testing ends. Do not use this path for real users.

In Supabase, open **Edge Functions → send-whatsapp-auth → Logs**, retry signup, and find `EDRA_DEV_AUTH_CODE`. Enter its six-digit `code` on `/auth/verify`. Supabase's normal OTP expiry and rate limits still apply.

## Production deployment

Follow [the production deployment checklist](../../../docs/production-deployment-checklist.md) before deploying a production build.
