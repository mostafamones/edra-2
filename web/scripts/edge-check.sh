#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Each deployed function owns its dependency map. Checking all entrypoints from web/ would
# resolve bare imports against package.json instead of the functions' deno.json files.
for entrypoint in supabase/functions/*/index.ts; do
  function_dir="$(dirname "$entrypoint")"
  deno check --frozen --config "$function_dir/deno.json" "$entrypoint"
done
