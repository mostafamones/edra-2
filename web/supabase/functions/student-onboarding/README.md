# Student parent-phone verification

Deploy this function with JWT verification enabled after applying the student account onboarding migration. It requires a signed-in account with a confirmed Egyptian mobile number. The function uses Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets. Parent-code hashes are keyed with the service-role secret; rotating it invalidates outstanding ten-minute challenges.

The function accepts `status`, `request`, `verify`, and `complete` actions from the student onboarding UI. It derives the account ID from the caller's validated JWT. Codes are six digits, expire in ten minutes, permit five attempts, and can be requested at most once per minute and five times per hour per account. Ordinary clients cannot read challenge rows or set a verified parent phone directly.

It shares these WhatsApp secrets with `send-whatsapp-auth`: `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TEMPLATE_LANGUAGE`, optional `META_WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_DEVELOPMENT_MODE`, and `WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE`. In development mode it logs `EDRA_DEV_PARENT_CODE` with the requested phone and code for fake-number testing, and attempts delivery to the configured test recipient when possible. In production it requires the approved Authentication template and successful delivery to the actual parent number; codes are never logged.

The public student invitation entry route is `/invite/student/<token>`. It retains the opaque token in an HttpOnly cookie through authentication and student setup. Token validation and academy joining are deferred.
