# Avatar resource probe

Preparation is local and free of provider calls, credentials, application storage and database access. From `web/`:

```sh
EDRA_IMAGE_MEMORY=1 EDRA_IMAGE_PROBE_DIR=/tmp/edra-avatar-resource-probe node workers-test/image-build.mjs
./node_modules/.bin/wrangler deploy --dry-run --config /tmp/edra-avatar-resource-probe/wrangler.json --outdir /tmp/edra-avatar-resource-probe-dry-run
```

Use a new, absent absolute directory for every preparation. It contains a standalone Worker, five precompiled Wasm modules and explicit Wrangler configuration. No Vite changes are needed. The generator never uploads or deploys. Its fixed synthetic inputs are RGB JPEG 2048, CMYK JPEG 2048, tagged 16-bit P3 PNG 2048 with alpha, and the original entropy-coded 10,001-scan CMYK 2048 fixture. Production `encodeAvatar` and all codec/profile modules are bundled unchanged.

Local measurements use `/usr/bin/time -v` around three fresh workerd processes per input, and an idle process loading the same fixture-bearing bundle. RSS includes runtime/native allocations and fixture strings; CPU includes process startup. These values are not isolate memory or Cloudflare CPU accounting. Do not subtract idle RSS and label the difference isolate memory. Wasm growth, GC and mixed-format warm-isolate behavior need deployed verification too.

Deployment and paid requests require a separate owner-authorized release check. The prepared config names only `edra-avatar-resource-probe`, has no app bindings/routes, enables observability and uses the default paid 30,000 ms CPU budget. Before that check, configure a random `PROBE_TOKEN` secret through the approved secret mechanism; no credential is generated, printed or requested during preparation. Every request is refused unless its bearer token matches. Only POST to `/rgb2048`, `/cmyk2048`, `/png16` or `/manyScans` runs an encode; arbitrary uploads are impossible. One encode runs at a time per isolate; overlapping requests get 429. Each response/log reports fixture, acceptance, byte counts and elapsed wall time. It does not report CPU or memory.

For a future authorized deployed check, preserve the exact source revision, module hashes, compatibility settings and deployment startup result (`startup_time_ms`). Run each fixture once cold and repeatedly warm, then mix the formats on the same deployed version. Capture Cloudflare invocation CPU/wall metrics and outcomes, including `exceededCpu`, `exceededMemory`, exceptions and error 1102. Confirm accepted 512 px opaque output with the ordinary avatar integration check. Successful isolated requests alone do not prove memory headroom under production concurrency. A standalone probe also excludes the rest of Edra's isolate: repeat the resource check against the full application before cutover. Remove the probe after the authorized check.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [metrics and outcomes](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/), [precompiled Wasm](https://developers.cloudflare.com/workers/runtime-apis/webassembly/), [Wrangler bundling](https://developers.cloudflare.com/workers/wrangler/bundling/). Actual deployed CPU/memory/startup evidence remains unavailable until that separate check runs.
