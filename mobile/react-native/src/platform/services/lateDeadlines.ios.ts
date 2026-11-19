import { loadEdraAuth } from '../../../modules/edra-auth/index.ts'
import type { AppServices } from '../../app/contract.ts'

export const lateDeadlines: AppServices['lateDeadlines'] = () => {
  // Session UUIDs are globally unique. Match the SwiftUI key exactly for upgrades and rollback.
  const native = loadEdraAuth()
  return {
    get: (sessionId) => native.readLateDeadline(sessionId),
    set: (sessionId, minutes) => native.writeLateDeadline(sessionId, minutes),
  }
}
