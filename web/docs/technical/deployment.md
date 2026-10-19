# Deployment

This guide describes the current setup sequence. It does not assert that production, cloud migrations or provider delivery have been verified.

## 1. Select the target and configure origins

Confirm the owned marketing/staff/student domains and the intended cloud Supabase project. Bind the exact hosts to the web deployment. Set matching public/server origins and the trusted cookie domain described in [routing](routing.md). Set public Supabase URL/publishable key from .env.example; keep service-role, provider and invitation-encryption keys server-side.

Configure only the authentication flows actually enabled. Existing phone/password, OTP and recovery flows do not require invented OAuth callbacks. If a redirect-based flow is enabled later, verify its exact URL allowlist at that time.

## 2. Prepare schema and application together

Review required migrations against the target's recorded schema before application. Routine non-destructive changes are pre-approved; destructive or hard-to-reverse changes require explicit owner approval and a preservation/rollback plan. Do not reset a shared target or rewrite applied migration history.

Deploy application and schema changes compatibly. In particular, the standalone assignment migration changes retired draft/published states to active and removes assignment Publish/Unpublish; older clients cannot be treated as compatible. Regenerate/check database types and policies for the applied schema.

## 3. Configure authentication delivery

Use the source-specific setup for [send-whatsapp-auth](../../supabase/functions/send-whatsapp-auth/README.md) and [student-onboarding](../../supabase/functions/student-onboarding/README.md). The first authenticates a signed hook; the second authenticates a student JWT. Their JWT deployment flags are not interchangeable.

Enable phone confirmation and configure the Send SMS Hook secret. Supply the approved production Authentication template/language, Meta sender ID/token and applicable provider configuration. Production uses the actual requested phone, not a redirected test recipient.

Disable WHATSAPP_DEVELOPMENT_MODE and remove development recipient/OTP-log overrides. Check both functions for production logging behavior. Keep template payload instructions matched to source; a development utility template is not the production authentication template.

### Current authentication/session behavior

Web uses cookie authority; v1 uses verified bearer authority. Both reject recovery-only phone-code sessions. Database request checks also enforce revoked/recovery session restrictions; public project keys are not staff identity. See [authority](../../src/lib/supabase/authority.ts).

Password recovery verifies the OTP server-side, keeps the resulting tokens in the HttpOnly recovery-route cookie for the ten-minute recovery window, sets the password, then attempts global sign-out. A password rejection can be retried within that window; a sign-out failure after password update is a distinct outcome. Do not repeat the older server-memory recovery description. See [recovery source](../../src/modules/auth/recovery.ts).

Account/parent verification is global student setup, not academy enrollment. The product invite/returning rules do not establish that the source's academy joining flow is deployed.

## Development video setup (Mux)

Mux is the owner-selected development video provider. The staff content module implements direct uploads, processing-state checks and short-lived signed staff previews. Student learning/access integration remains separate. See the [content module](../../src/modules/content/README.md) for the current source boundary; credentials alone do not establish browser/provider verification.

Use an Edra-owned Mux account and a development environment separate from production. Create an environment-scoped API access token with Video Read/Write permissions. If implementation will provision signing keys or webhooks through the API, the setup token also needs the corresponding System permissions; an owner can instead create those resources in the dashboard without broadening the runtime token. Keep API Token ID/Secret in the ignored web/.env.local as MUX_TOKEN_ID and MUX_TOKEN_SECRET, never in NEXT_PUBLIC_ variables or committed files.

Signed playback uses MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY (Mux's base64-encoded PEM), both server-only. The optional /api/webhooks/mux endpoint needs the matching MUX_WEBHOOK_SECRET from a configured Mux webhook. Configure it only on a deliberately reachable deployment; the editor also checks processing status without a callback. The official packaged Mux CLI has no Windows binary at the time of implementation; Windows setup can use the Mux REST API directly. Do not point development webhooks at production.

The implementation must authorize uploads, use provider direct uploads, verify processing callbacks and issue signed playback only after Edra's access checks. Retain the configured cloud Supabase application target and an isolated cloud test target for schema/RLS verification; Mux does not replace either. No local Supabase database is required.

References: [Mux API credentials and permissions](https://www.mux.com/docs/core/make-api-requests), [signed playback](https://www.mux.com/docs/guides/secure-video-playback), and [local webhook forwarding](https://www.mux.com/docs/core/listen-for-webhooks). These are setup instructions, not evidence of provider verification or deployment.

## 4. Run release checks

Run the relevant [web checks](../engineering.md#verification). Verify required database operations/policies on the authorized target. Confirm HTTPS, origins, authentication authority and operational error reporting.

Using controlled phones, verify signup/OTP, sign-in/recovery and parent verification against the selected deployment. Test academy isolation and the actual staff workflows being released. Student-academy access, content, parent delivery and native capabilities are released only when their own implementation is verified; an outbox or route file alone is insufficient.

Record which source/build/cloud/provider checks passed and what remains. Provider credentials/templates, DNS, signing and distribution are concrete release operations, not changes performed by this documentation review.
