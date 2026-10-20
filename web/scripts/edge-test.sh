#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v deno >/dev/null 2>&1; then
  echo "Edge runtime tests require Deno 2 on PATH." >&2
  exit 1
fi

# Explicit enumeration prevents an accidentally empty suite; each entrypoint gets a
# separate process, dependency map, frozen lockfile, and exact config permissions.
suites=(send-whatsapp-auth account-contact account-password student-onboarding)
delivery_env="META_WHATSAPP_ACCESS_TOKEN,META_WHATSAPP_PHONE_NUMBER_ID,META_WHATSAPP_TEMPLATE_LANGUAGE,META_WHATSAPP_GRAPH_API_VERSION,WHATSAPP_DEVELOPMENT_MODE,WHATSAPP_DEVELOPMENT_RECIPIENT_PHONE"
for suite in "${suites[@]}"; do
  test_file="supabase/functions/$suite/index_test.ts"
  if [[ ! -f "$test_file" ]]; then
    echo "Missing expected Edge runtime suite: $test_file" >&2
    exit 1
  fi
done

deno --version
for suite in "${suites[@]}"; do
  case "$suite" in
    send-whatsapp-auth) config_env="SEND_SMS_HOOK_SECRET,EDRA_AUTH_DEV_LOG_PHONE,EDRA_AUTH_DEV_LOG_UNTIL" ;;
    account-password) config_env="SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY" ;;
    account-contact|student-onboarding) config_env="SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY" ;;
  esac
  deno test --frozen --no-prompt --deny-net --sanitize-ops --sanitize-resources \
    --allow-env="$config_env,$delivery_env" \
    --config "supabase/functions/$suite/deno.json" \
    "supabase/functions/$suite/index_test.ts"
done
