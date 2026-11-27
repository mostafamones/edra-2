import type { AssignmentSummary } from '../assignments/api.ts'
import type { LiveSession } from '../sessions/contract.ts'

/** Rows Overview shows per list before linking to the full tab. */
export const OVERVIEW_ROWS = 3

/** The first live sessions; `more` links to Sessions when the loaded list has others. */
export function overviewSessions(sessions: readonly LiveSession[]) {
  return { shown: sessions.slice(0, OVERVIEW_ROWS), more: sessions.length > OVERVIEW_ROWS }
}

/** Active assignments from the loaded pages; `more` also covers unloaded pages, which may hold active work. */
export function overviewAssignments(assignments: readonly AssignmentSummary[], hasMore: boolean) {
  const active = assignments.filter((a) => a.state === 'active')
  return { shown: active.slice(0, OVERVIEW_ROWS), more: hasMore || active.length > OVERVIEW_ROWS }
}

const ROLES: Record<string, string> = { owner: 'Owner', head_admin: 'Head Admin', admin: 'Admin', instructor: 'Instructor' }

/** The server's role string as a label; an unknown role is shown as sent, never mapped to permissions. */
export function roleLabel(role: string): string {
  return ROLES[role] ?? role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
