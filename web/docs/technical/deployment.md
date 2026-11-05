# Deployment

This guide describes the current setup sequence. It does not assert that production, cloud migrations or provider delivery have been verified.

## Workers target

The Vite configuration uses the official Cloudflare Vite plugin and `web/wrangler.jsonc` targets Workers. Build with `npm run build`; consult the [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/) and Wrangler configuration for deployment. Local production-build and actual `workerd` checks passed on 2026-11-02, including SSR, host/API/RPC transport, CSRF/cookies, image codecs and provider dependencies. Anonymous public-page comparisons and local browser smoke/UI-fixture checks have also passed; see [migration verification](framework-migration.md). These do not establish authenticated CI parity, deployed runtime quotas, production deployment, DNS or controlled before/after performance measurements. The check records stay in the uncommitted migration evidence of the migration checkout; repeat these checks on the commit being released.

The production build excludes `.dev.vars*` and `.env*` output files; the final build guard removes any such copied or stale files and fails the build. Local `vite dev` continues to load the ignored development environment normally. `vite preview` uses the built output and therefore does not inherit local secret files: supply any needed preview bindings separately in the generated `dist/server/.dev.vars` **after** building, and remove it before packaging or rebuilding. Do not publish or archive that file. Cloudflare documents that this file is used for preview and is not uploaded with the Worker; configure production secrets in Cloudflare instead. `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` can include the process environment in local variables and must not be used to package secrets. See [Cloudflare Vite secrets](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/) and [local environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/).

## Single-cutover handoff (not run)

After an authorized push, require passing `CI / web`, `e2e`, `ui`, `database`, `edge`, and `attendance-e2e`; also complete the two independent attendance passes and deliberately failing control described in [engineering verification](../engineering.md#authenticated-attendance-integration). These hosted gates remain outstanding on the changed tree. Avatar scan/color compatibility fixes have local differential and workerd evidence; real authenticated workflows and deployed CPU/memory/startup remain unverified. Deployment and worktree folder renaming are outside the final integration task. Signed-out browser checks have run locally; they do not establish authenticated workflow parity. The generated `src/routeTree.gen.ts` must be tracked in the commit for the CI gate.

Measure the final Worker upload size before release. On 2026-11-02, `npx wrangler deploy --dry-run` used the generated `dist/server/wrangler.json` and reported 19,145.30 KiB total / 4,754.41 KiB gzip, then exited without deployment. Cloudflare’s [current limits](https://developers.cloudflare.com/workers/platform/limits/#worker-size), updated 2026-10-29, allow 64 MiB uncompressed on Free and Paid and impose no compressed-size cap. That historical measurement predates the final candidate; it does not establish the final artifact size or deployed resource compliance. Earlier migration notes citing 3/10 MB compressed limits are obsolete. Cloudflare lists CPU at 10 ms on Free and 30 s by default on Paid (configurable up to 5 minutes), 128 MB memory and 1 s startup. Validate these quotas on the actual target account; local workerd tests do not enforce deployed quotas. No plan change or spending is authorized by the migration. Performance, production HTTPS, cookie behavior, hosted integrations and DNS remain unverified.

Build with the final six `VITE_` public values from `.env.example` and matching server origins. The build guard described above strips the plugin's `dist/server/.dev.vars` output; still use a clean release environment. Client assets and server output are separate; run `npm run check:client-secrets` against the release build.

Configure Worker secrets as needed for enabled flows using `npx wrangler secret put NAME` from `web/`: `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_INVITE_LINK_KEY`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`, and `MUX_WEBHOOK_SECRET`. Set `EDRA_MARKETING_ORIGIN`, `EDRA_APP_ORIGIN`, `EDRA_LEARN_ORIGIN`, and optional `EDRA_API_ALLOWED_ORIGINS` with `wrangler secret put` or a `vars` entry in the Wrangler configuration; `wrangler deploy` removes dashboard-only plain variables unless `keep_vars` is set. Supabase Edge Function secrets are configured separately, as described below. Supply secret values privately; do not commit them. The Worker's Cron Trigger (`triggers.crons` in `wrangler.jsonc`, every 15 minutes) runs `src/server.ts` `scheduled`, which deletes removed concern media from Storage; it needs `SUPABASE_SERVICE_ROLE_KEY` and otherwise does nothing.

Once all gates pass and deployment is authorized, from `web/` run `npm run build`, `npm run check:client-secrets`, and `npx wrangler deploy`. `web/wrangler.jsonc` declares no routes or custom domains, so this upload does not take traffic. The gateway answers `421` on the `workers.dev` hostname because it is not a canonical host, so that URL proves the upload only, not application behavior. Application checks need the canonical hosts bound to the Worker. Record existing DNS targets and the previous deployment first; cut over all hosts together, then smoke-test host routing, login, shared cookies, staff/student redirects, authenticated attendance persistence and tenant denial with controlled accounts. If checks fail, restore the recorded DNS targets and previous deployment using the provider's rollback procedure, then verify the restored hosts. None of these operations or checks has been performed here.

## 1. Select the target and configure origins

Confirm the owned marketing/staff/student domains and the intended cloud Supabase project. Bind the exact hosts to the web deployment. Set matching public/server origins and the trusted cookie domain described in [routing](routing.md). Set public Supabase URL/publishable key from .env.example; keep service-role, provider and invitation-encryption keys server-side. Production ignores the development-only EDRA_DEV_TUNNEL_HOST alias; leave it unset there and serve every public host through its canonical HTTPS origin.

Configure only the authentication flows actually enabled. Existing phone/password, OTP and recovery flows do not require invented OAuth callbacks. If a redirect-based flow is enabled later, verify its exact URL allowlist at that time.

## 2. Prepare schema and application together

Review required migrations against the target's recorded schema before application. Routine non-destructive changes are pre-approved; destructive or hard-to-reverse changes require explicit owner approval and a preservation/rollback plan. Do not reset a shared target or rewrite applied migration history.

Deploy application and schema changes compatibly. In particular, the standalone assignment migration changes retired draft/published states to active and removes assignment Publish/Unpublish; older clients cannot be treated as compatible. Regenerate/check database types and policies for the applied schema.

## 3. Configure authentication delivery

Use the source-specific setup for [send-whatsapp-auth](../../supabase/functions/send-whatsapp-auth/README.md), [student-onboarding](../../supabase/functions/student-onboarding/README.md) [account-password](../../supabase/functions/account-password/README.md) and [account-contact](../../supabase/functions/account-contact/README.md). The first authenticates a signed hook; the others authenticate a user JWT. Their JWT deployment flags are not interchangeable.

Enable phone confirmation and configure the Send SMS Hook secret. Supply the approved production Authentication template/language, Meta sender ID/token and applicable provider configuration. Production uses the actual requested phone, not a redirected test recipient.

Disable WHATSAPP_DEVELOPMENT_MODE and remove development recipient/OTP-log overrides. Check every function for production logging behavior. Keep template payload instructions matched to source; a development utility template is not the production authentication template.

### Current authentication/session behavior

Web uses cookie authority; v1 uses verified bearer authority. Both reject recovery-only phone-code sessions. Database request checks also enforce revoked/recovery session restrictions; public project keys are not staff identity. See [authority](../../src/lib/supabase/authority.ts).

Password recovery verifies the OTP server-side, keeps the resulting tokens in the HttpOnly recovery-route cookie for the ten-minute recovery window, sets the password, then attempts global sign-out. A password rejection can be retried within that window; a sign-out failure after password update is a distinct outcome. Do not repeat the older server-memory recovery description. See [recovery source](../../src/modules/auth/recovery.ts).

Settings password change verifies a code to the current account phone, updates the password under the user's own session and keeps it; hosted Auth revokes the other sessions. Keep Auth's secure password change and current-password requirement off unless the function's adapter is updated first (see [account settings](../../src/modules/account/README.md)). The `avatars` Storage bucket and its policies come from migration `20261018150000_account_profile_settings.sql`; no dashboard bucket setup is needed.

Account/parent verification is global student setup, not academy enrollment. The product invite/returning rules do not establish that the source's academy joining flow is deployed.

## Development video setup (Mux)

Mux is the owner-selected development video provider. The staff content module implements direct uploads, processing-state checks and short-lived signed staff previews. Student learning/access integration remains separate. See the [content module](../../src/modules/content/README.md) for the current source boundary; credentials alone do not establish browser/provider verification.

Use an Edra-owned Mux account and a development environment separate from production. Create an environment-scoped API access token with Video Read/Write permissions. If implementation will provision signing keys or webhooks through the API, the setup token also needs the corresponding System permissions; an owner can instead create those resources in the dashboard without broadening the runtime token. Keep API Token ID/Secret in the ignored web/.env.local as MUX_TOKEN_ID and MUX_TOKEN_SECRET, never in VITE_ variables or committed files.

Signed playback uses MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY (Mux's base64-encoded PEM), both server-only. The optional /api/webhooks/mux endpoint needs the matching MUX_WEBHOOK_SECRET from a configured Mux webhook. Configure it only on a deliberately reachable deployment; the editor also checks processing status without a callback. The official packaged Mux CLI has no Windows binary at the time of implementation; Windows setup can use the Mux REST API directly. Do not point development webhooks at production.

The implementation must authorize uploads, use provider direct uploads, verify processing callbacks and issue signed playback only after Edra's access checks. Use the configured cloud Supabase application target for hosted integration checks and disposable GitHub Actions databases for schema/RLS verification; Mux does not replace these checks. No local Supabase database is required.

References: [Mux API credentials and permissions](https://www.mux.com/docs/core/make-api-requests), [signed playback](https://www.mux.com/docs/guides/secure-video-playback), and [local webhook forwarding](https://www.mux.com/docs/core/listen-for-webhooks). These are setup instructions, not evidence of provider verification or deployment.

## 4. Run release checks

Run the relevant [web checks](../engineering.md#verification). Verify required database operations/policies on the authorized target. Confirm HTTPS, origins, authentication authority and operational error reporting.

Using controlled phones, verify signup/OTP, sign-in/recovery and parent verification against the selected deployment. Test academy isolation and the actual staff workflows being released. Student-academy access, content, parent delivery and native capabilities are released only when their own implementation is verified; an outbox or route file alone is insufficient.

Record which source/build/cloud/provider checks passed and what remains. Provider credentials/templates, DNS, signing and distribution are concrete release operations, not changes performed by this documentation review.
