import { NETWORK_MESSAGE, UNCODED_ERROR, UNREADABLE_RESPONSE, type APIError, type APIFailure } from './port.ts'

/**
 * How an attendance write ended (parity with iOS AttendanceWriteOutcome). `uncertain` keeps the whole
 * command (body and Idempotency-Key) for Retry; `rejected` is definitive and ends the command.
 */
export type WriteOutcome =
  | { kind: 'uncertain'; message: string }
  | { kind: 'rejected'; failure: APIFailure }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'cancelled' }

export function writeOutcome(error: APIError): WriteOutcome {
  switch (error.kind) {
    case 'unauthenticated':
    case 'forbidden':
    case 'cancelled':
      return error
    case 'network':
      return { kind: 'uncertain', message: "Couldn't reach the server. Retry to be sure; it won't be saved twice." }
    case 'server':
      return { kind: 'uncertain', message: error.message }
    case 'rejected': {
      const { failure } = error
      if (failure.code === 'THROTTLED') return { kind: 'uncertain', message: 'Too many changes in a short time. Retry in a moment.' }
      if (failure.status >= 500 || failure.code === UNREADABLE_RESPONSE) {
        return { kind: 'uncertain', message: "The server couldn't confirm the change. Retry to be sure; it won't be saved twice." }
      }
      return error
    }
  }
}

const messages: Record<string, string> = {
  SESSION_ENDED: 'This session has ended. Check-ins are closed; staff can still review attendance.',
  SESSION_ARCHIVED: 'This session is archived. Its attendance is read-only.',
  YEAR_CLOSED: 'This academic year is closed. Attendance is read-only.',
  NOT_ON_ROSTER: "This student isn't on this session's roster.",
  STUDENT_NOT_FOUND: "This student isn't in this session's academy and year.",
  STUDENT_ARCHIVED: 'This student is archived. Restore them on the web before adding them.',
  STUDENT_CODES_DISABLED: 'Student codes are off for this academy. Check the student in by name.',
  STUDENT_CODE_RETIRED: "This code is no longer active. Use the student's current code.",
  STUDENT_CODE_NOT_FOUND: 'No student in this academy has this code.',
  STUDENT_CODE_AMBIGUOUS: 'This code was issued to more than one student. Check the student in by name.',
  ATTENDANCE_CONFLICT: 'Someone else changed this student first. Review the current value and try again.',
  ATTENDANCE_REVIEW_STALE: 'Attendance changed after you reviewed it. Nothing was saved; review the latest values.',
  PUBLICATION_STALE: 'Attendance changed after you reviewed it. Nothing was saved; review the latest values.',
  IDEMPOTENCY_CONFLICT: "This request didn't match its earlier attempt. Start the action again.",
}

/** Message for a definitive failure. A 404/405 without a code is a server that predates the endpoint. */
export function failureMessage(failure: APIFailure): string {
  if (failure.code === UNCODED_ERROR && (failure.status === 404 || failure.status === 405)) {
    return "This server doesn't support this action yet. It needs an update."
  }
  return messages[failure.code] ?? failure.message
}

/** Message for a failed read. */
export function readMessage(error: Exclude<APIError, { kind: 'unauthenticated' | 'forbidden' | 'cancelled' }>): string {
  if (error.kind === 'network') return NETWORK_MESSAGE
  if (error.kind === 'server') return error.message
  return failureMessage(error.failure)
}

export const newKey = (): string => globalThis.crypto.randomUUID()
