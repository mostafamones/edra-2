import defaultEntry, { createServerEntry } from '@tanstack/react-start/server-entry'
import { gateway } from './lib/server/gateway'

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void }
const MEDIA_CRON = '*/15 * * * *'

const worker = {
  ...createServerEntry({
    fetch(request, options) { return gateway(request, forwarded => Promise.resolve(defaultEntry.fetch(forwarded, options))) },
  }),
  // Cron Triggers (wrangler.jsonc): bounded trusted work that must not wait for user traffic.
  // Every minute: notification push retries and anything a post-command dispatch missed.
  scheduled(controller: { cron: string }, _env: unknown, context: ScheduledContext) {
    if (controller.cron === MEDIA_CRON) context.waitUntil(import('./modules/concerns/media.server').then(media => media.runConcernMediaMaintenance()))
    else context.waitUntil(import('./modules/notifications/server').then(notifications => notifications.runNotificationDispatch()))
  },
}

export default worker
