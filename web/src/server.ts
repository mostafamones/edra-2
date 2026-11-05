import defaultEntry, { createServerEntry } from '@tanstack/react-start/server-entry'
import { gateway } from './lib/server/gateway'

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void }

const worker = {
  ...createServerEntry({
    fetch(request, options) { return gateway(request, forwarded => Promise.resolve(defaultEntry.fetch(forwarded, options))) },
  }),
  // Cron Trigger (wrangler.jsonc): bounded trusted maintenance that must not wait for user traffic.
  scheduled(_controller: unknown, _env: unknown, context: ScheduledContext) {
    context.waitUntil(import('./modules/concerns/media.server').then(media => media.runConcernMediaMaintenance()))
  },
}

export default worker
