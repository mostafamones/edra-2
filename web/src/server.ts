import defaultEntry, { createServerEntry } from '@tanstack/react-start/server-entry'
import { gateway } from './lib/server/gateway'

export default createServerEntry({
  fetch(request, options) { return gateway(request, forwarded => Promise.resolve(defaultEntry.fetch(forwarded, options))) },
})
